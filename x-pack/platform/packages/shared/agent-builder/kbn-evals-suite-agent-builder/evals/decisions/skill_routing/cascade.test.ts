/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createBm25Ranker } from './bm25';
import type { CatalogSkill } from './catalog';
import { createSkillResolver, loadCatalog } from './catalog';
import type { JevRaw, RoutingItem } from './cascade';
import {
  ARMS,
  assertWithinTokenCap,
  buildRoutingItems,
  canonicaliseJevRaw,
  CHOICE_QUESTION,
  deriveArms,
  GATE_QUESTION,
  rankFromProbabilities,
  routingQuestions,
  routingState,
} from './cascade';

const skills: CatalogSkill[] = [
  {
    id: 'find-security-rules',
    name: 'find-security-rules',
    description: 'Find detection rules by MITRE technique.',
    domain: 'security',
    source: 'static',
  },
  {
    id: 'search.keyword-search',
    name: 'keyword-search',
    description: 'Build a keyword search experience.',
    domain: 'search',
    source: 'static',
  },
];

const items: RoutingItem[] = [
  {
    id: 'R1',
    query: 'find rules for MITRE T1059',
    expected: 'find-security-rules',
    expectedDomain: 'security',
    ambiguous: false,
    source: 'benchmark',
    queryType: 'direct',
  },
  {
    id: 'N1',
    query: 'thanks!',
    expected: null,
    ambiguous: false,
    source: 'control',
    queryType: 'control',
  },
];

const raw = (id: string, gate: number, choice: string): JevRaw => ({
  id,
  gate,
  choice,
  probabilities: { [choice]: 0.7, other: 0.3 },
  confidence: 0.7,
  inputTokens: 1000,
  outputTokens: 0,
  latencyMs: 700,
  costUsd: 0.000042,
});

describe('routing items', () => {
  it('adds the 20 no-skill controls to both views', () => {
    const catalog = loadCatalog();
    const security = buildRoutingItems(catalog, 'security');
    const full = buildRoutingItems(catalog, 'full');
    expect(security.items).toHaveLength(51 + 20);
    expect(full.items).toHaveLength(169 + 20);
    expect(full.items.filter(({ source }) => source === 'control')).toHaveLength(20);
  });
});

describe('questions', () => {
  it('asks a noul gate and a choice over every skill in the view', () => {
    const questions = routingQuestions('full', skills);
    expect(questions[GATE_QUESTION].type).toBe('noul');
    const choice = questions[CHOICE_QUESTION];
    expect(choice.type === 'choice' && Object.keys(choice.criteria)).toEqual(
      skills.map(({ id }) => id)
    );
  });

  it('refuses a request whose estimate exceeds the cap', () => {
    const questions = routingQuestions('full', skills);
    expect(assertWithinTokenCap(routingState('hi'), questions)).toBeLessThan(1000);
    expect(() => assertWithinTokenCap(routingState('hi'), questions, 10)).toThrow(/cap/);
  });

  it('keeps the full-view request under the cap with the real catalog', () => {
    const catalog = loadCatalog();
    const { items: all, skills: everything } = buildRoutingItems(catalog, 'full');
    const questions = routingQuestions('full', everything);
    for (const { query } of all) assertWithinTokenCap(routingState(query), questions);
  });
});

describe('canonicaliseJevRaw', () => {
  it('maps returned names to catalog ids and counts what it took', () => {
    const { raw: mapped, resolution } = canonicaliseJevRaw(
      [
        { ...raw('R1', 0.9, 'keyword-search'), probabilities: { 'keyword-search': 0.6, x: 0.4 } },
        raw('N1', 0.1, 'find-security-rules'),
      ],
      createSkillResolver(skills)
    );
    expect(mapped[0].choice).toBe('search.keyword-search');
    expect(mapped[0].probabilities).toEqual({ 'search.keyword-search': 0.6 });
    expect(resolution.canonicalised).toContainEqual({
      from: 'keyword-search',
      to: 'search.keyword-search',
    });
    expect(resolution.unresolved).toContain('x');
    expect(resolution.checked).toBe(resolution.exact + resolution.canonicalised.length + 2);
  });

  it('blanks a choice it cannot resolve rather than guessing', () => {
    const { raw: mapped } = canonicaliseJevRaw(
      [raw('R1', 0.9, 'made-up')],
      createSkillResolver(skills)
    );
    expect(mapped[0].choice).toBe('');
  });
});

describe('deriveArms', () => {
  const bm25 = createBm25Ranker(skills);

  it('builds only the zero-cost arms without Jev answers', () => {
    const arms = deriveArms({ items, skills, view: 'security', bm25 });
    expect(Object.keys(arms).sort()).toEqual(
      [ARMS.bm25, ARMS.majority, ARMS.oracleGateBm25].sort()
    );
    expect(arms[ARMS.bm25].find(({ id }) => id === 'N1')?.abstained).toBe(true);
    expect(arms[ARMS.oracleGateBm25].find(({ id }) => id === 'R1')?.abstained).toBe(false);
  });

  it('adds the domain oracle on the full view only', () => {
    expect(deriveArms({ items, skills, view: 'full', bm25 })[ARMS.oracleDomainBm25]).toHaveLength(
      2
    );
  });

  it('gates the cascade at the threshold and keeps usage on the Jev arms', () => {
    const arms = deriveArms({
      items,
      skills,
      view: 'security',
      bm25,
      jev: [raw('R1', 0.5, 'find-security-rules'), raw('N1', 0.49, 'find-security-rules')],
    });
    const cascade = arms[ARMS.jevCascade];
    expect(cascade.map(({ abstained }) => abstained)).toEqual([false, true]);
    expect(cascade[0].ranked[0]).toBe('find-security-rules');
    expect(arms[ARMS.jevUngated].every(({ abstained }) => !abstained)).toBe(true);
    expect(arms[ARMS.jevGateBm25][0].costUsd).toBeGreaterThan(0);
    expect(arms[ARMS.oracleGateJev][0].costUsd).toBe(0);
  });

  it('refuses Jev answers that miss an item', () => {
    expect(() =>
      deriveArms({ items, skills, view: 'security', bm25, jev: [raw('R1', 0.9, 'x')] })
    ).toThrow(/one population/);
  });

  it('ranks probabilities descending with id tie-break', () => {
    expect(rankFromProbabilities({ b: 0.5, a: 0.5, c: 0.9 })).toEqual(['c', 'a', 'b']);
  });
});
