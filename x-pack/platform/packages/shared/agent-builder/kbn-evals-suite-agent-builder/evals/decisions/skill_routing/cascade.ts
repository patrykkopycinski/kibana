/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { JevClient, JevQuestion } from '../lib/jev_client';
import { jevCostUsd } from '../lib/jev_client';
import type { Bm25Ranker } from './bm25';
import type { Catalog, CatalogSkill, RoutingView, SkillDomain, SkillResolver } from './catalog';
import { loadRoutingCases, viewCases } from './dataset';

/**
 * Skill routing as a two-question cascade: a noul gate ("does any skill apply?") and a choice
 * over the view's skills. Both go in one request; Jev answers each question in isolation, so
 * this is the two-call design at the price of one.
 */

export const SKILL_ROUTING_PATH_ID = 'AB-SKILL-ROUTING';
export const GATE_QUESTION = 'any_skill_applies';
export const CHOICE_QUESTION = 'skill';
export const DEFAULT_GATE_THRESHOLD = 0.5;
/** TypeSafe's documented per-request cap. */
export const JEV_REQUEST_TOKEN_CAP = 32_000;
/** English averages ~4 chars per token; 3 keeps the estimate on the safe side. */
const CHARS_PER_TOKEN_LOWER_BOUND = 3;

export interface RoutingItem {
  id: string;
  query: string;
  /** Catalog id that should be selected; null when no skill should load. */
  expected: string | null;
  expectedDomain?: SkillDomain;
  ambiguous: boolean;
  source: 'benchmark' | 'control';
  /** Benchmark query type; `control` for the synthetic no-skill queries. */
  queryType: 'direct' | 'indirect' | 'distractor' | 'control';
}

export const ARMS = {
  jevCascade: 'jev cascade (gate, then choice)',
  jevUngated: 'jev choice, ungated',
  jevGateBm25: 'jev gate + bm25',
  bm25: 'bm25 (abstain on zero overlap)',
  majority: 'majority constant',
  oracleGateBm25: 'oracle gate + bm25 (ceiling)',
  oracleDomainBm25: 'oracle domain + bm25 (ceiling)',
  oracleGateJev: 'oracle gate + jev choice (ceiling)',
} as const;

export type ArmKind = 'model' | 'local' | 'constant' | 'oracle';

export const ARM_KINDS: Readonly<Record<string, ArmKind>> = {
  [ARMS.jevCascade]: 'model',
  [ARMS.jevUngated]: 'model',
  [ARMS.jevGateBm25]: 'model',
  [ARMS.bm25]: 'local',
  [ARMS.majority]: 'constant',
  [ARMS.oracleGateBm25]: 'oracle',
  [ARMS.oracleDomainBm25]: 'oracle',
  [ARMS.oracleGateJev]: 'oracle',
};

const DOMAIN_SCOPE: Readonly<Record<RoutingView, string>> = {
  security: 'Elastic Security',
  full: 'Elastic (security, observability, search, or the Kibana platform)',
};

const loadControls = (file = path.join(__dirname, 'no_skill_controls.json')) =>
  JSON.parse(fs.readFileSync(file, 'utf-8')) as Array<{ id: string; query: string }>;

/** Benchmark rows of the view plus the synthetic no-skill controls. */
export const buildRoutingItems = (
  catalog: Catalog,
  view: RoutingView
): { items: RoutingItem[]; skills: CatalogSkill[]; resolver: SkillResolver } => {
  const { cases } = loadRoutingCases(catalog);
  const { cases: selected, skills, resolver } = viewCases(cases, catalog, view);
  const domains = new Map(catalog.skills.map(({ id, domain }) => [id, domain]));
  const items: RoutingItem[] = [
    ...selected.map(({ id, query, expected, ambiguous, queryType }) => ({
      id,
      query,
      expected,
      ...(expected ? { expectedDomain: domains.get(expected) } : {}),
      ambiguous,
      source: 'benchmark' as const,
      queryType,
    })),
    ...loadControls().map(({ id, query }) => ({
      id,
      query,
      expected: null,
      ambiguous: false,
      source: 'control' as const,
      queryType: 'control' as const,
    })),
  ];
  return { items, skills, resolver };
};

export const routingState = (query: string) =>
  `A user sent this message to an Elastic AI agent:\n\n${query}`;

export const routingQuestions = (
  view: RoutingView,
  skills: readonly CatalogSkill[]
): Record<string, JevQuestion> => ({
  [GATE_QUESTION]: {
    type: 'noul',
    instructions: `The message asks for work in ${DOMAIN_SCOPE[view]} that needs one of the agent's specialised skills.`,
    criteria: {
      true: 'A concrete task on Elastic data, rules, alerts, configuration or features.',
      false:
        'Small talk, a follow-up about the previous answer, or general knowledge the agent can answer directly.',
    },
  },
  [CHOICE_QUESTION]: {
    type: 'choice',
    instructions: 'Which skill should the agent load to handle this message?',
    criteria: Object.fromEntries(skills.map(({ id, description }) => [id, description])),
  },
});

export const estimateTokens = (text: string) =>
  Math.ceil(text.length / CHARS_PER_TOKEN_LOWER_BOUND);

/** Refuses before sending when the upper-bound token estimate could hit the request cap. */
export const assertWithinTokenCap = (
  state: string,
  questions: Record<string, JevQuestion>,
  cap = JEV_REQUEST_TOKEN_CAP
): number => {
  const estimate = estimateTokens(JSON.stringify({ state, questions }));
  if (estimate > cap) {
    throw new Error(`request estimate ${estimate} tokens exceeds the ${cap}-token cap`);
  }
  return estimate;
};

/** One Jev response for one item, as frozen to disk for `--recompute`. */
export interface JevRaw {
  id: string;
  gate: number;
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  servedModel?: string;
}

export const runJevRouting = async (
  client: JevClient,
  items: readonly RoutingItem[],
  view: RoutingView,
  skills: readonly CatalogSkill[]
): Promise<JevRaw[]> => {
  const questions = routingQuestions(view, skills);
  for (const { query } of items) assertWithinTokenCap(routingState(query), questions);
  return Promise.all(
    items.map(async ({ id, query }) => {
      const result = await client.ask(routingState(query), questions, `${view}-${id}`);
      const gate = result.answers[GATE_QUESTION];
      const choice = result.answers[CHOICE_QUESTION];
      if (gate?.type !== 'noul' || choice?.type !== 'choice') {
        throw new Error(`[${view}/${id}] expected a noul and a choice answer`);
      }
      return {
        id,
        gate: gate.noul,
        choice: choice.choice,
        probabilities: choice.probabilities,
        confidence: choice.confidence,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        costUsd: jevCostUsd(result.inputTokens),
        servedModel: result.model,
      };
    })
  );
};

export interface OutputResolution {
  checked: number;
  exact: number;
  canonicalised: Array<{ from: string; to: string }>;
  unresolved: string[];
}

/** Rule 9: map every skill name the model returned to a catalog id, and count what that took. */
export const canonicaliseJevRaw = (
  raw: readonly JevRaw[],
  resolver: SkillResolver
): { raw: JevRaw[]; resolution: OutputResolution } => {
  const resolution: OutputResolution = { checked: 0, exact: 0, canonicalised: [], unresolved: [] };
  const canonical = (name: string): string | undefined => {
    resolution.checked++;
    const resolved = resolver(name);
    if (resolved.kind === 'exact') {
      resolution.exact++;
      return resolved.id;
    }
    if (resolved.kind === 'canonicalised') {
      resolution.canonicalised.push({ from: name, to: resolved.id });
      return resolved.id;
    }
    resolution.unresolved.push(name);
    return undefined;
  };
  const mapped = raw.map((entry) => {
    const probabilities: Record<string, number> = {};
    for (const [name, probability] of Object.entries(entry.probabilities)) {
      const id = canonical(name);
      if (id) probabilities[id] = Math.max(probabilities[id] ?? 0, probability);
    }
    return { ...entry, choice: canonical(entry.choice) ?? '', probabilities };
  });
  return { raw: mapped, resolution };
};

/** What one arm surfaced for one item. `abstained` means no skill was surfaced at all. */
export interface RoutedPrediction {
  id: string;
  abstained: boolean;
  ranked: string[];
  gateScore?: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  servedModel?: string;
}

export const rankFromProbabilities = (probabilities: Record<string, number>): string[] =>
  Object.entries(probabilities)
    .sort(([a, pa], [b, pb]) => pb - pa || a.localeCompare(b))
    .map(([id]) => id);

const free = { inputTokens: 0, outputTokens: 0, latencyMs: 0, costUsd: 0 };

/** Every arm's predictions for one view. Jev arms are added only when Jev answers exist. */
export const deriveArms = ({
  items,
  skills,
  view,
  bm25,
  jev,
  gateThreshold = DEFAULT_GATE_THRESHOLD,
}: {
  items: readonly RoutingItem[];
  skills: readonly CatalogSkill[];
  view: RoutingView;
  bm25: Bm25Ranker;
  jev?: readonly JevRaw[];
  gateThreshold?: number;
}): Record<string, RoutedPrediction[]> => {
  const bm25Ranked = new Map(items.map(({ id, query }) => [id, bm25(query)]));
  const lexical = (id: string) => bm25Ranked.get(id) ?? [];
  const domains = new Map(skills.map(({ id, domain }) => [id, domain]));

  const counts = new Map<string, number>();
  for (const { expected, ambiguous, source } of items) {
    if (expected && !ambiguous && source === 'benchmark') {
      counts.set(expected, (counts.get(expected) ?? 0) + 1);
    }
  }
  const byFrequency = [...counts.entries()]
    .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b))
    .map(([id]) => id);

  const arms: Record<string, RoutedPrediction[]> = {
    [ARMS.bm25]: items.map(({ id }) => ({
      id,
      abstained: (lexical(id)[0]?.score ?? 0) === 0,
      ranked: lexical(id).map(({ id: skill }) => skill),
      ...free,
    })),
    [ARMS.majority]: items.map(({ id }) => ({
      id,
      abstained: false,
      ranked: byFrequency,
      ...free,
    })),
    [ARMS.oracleGateBm25]: items.map(({ id, expected }) => ({
      id,
      abstained: expected === null,
      ranked: lexical(id).map(({ id: skill }) => skill),
      ...free,
    })),
  };
  if (view === 'full') {
    arms[ARMS.oracleDomainBm25] = items.map(({ id, expected, expectedDomain }) => ({
      id,
      abstained: expected === null,
      ranked: lexical(id)
        .map(({ id: skill }) => skill)
        .filter((skill) => domains.get(skill) === expectedDomain),
      ...free,
    }));
  }
  if (!jev) return arms;

  const byId = new Map(jev.map((entry) => [entry.id, entry]));
  const answer = (id: string): JevRaw => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`no Jev answer for [${id}]; arms must cover one population`);
    return entry;
  };
  const usage = (entry: JevRaw) => ({
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    latencyMs: entry.latencyMs,
    costUsd: entry.costUsd,
    servedModel: entry.servedModel,
  });
  const choiceRanking = (entry: JevRaw) => {
    const ranked = rankFromProbabilities(entry.probabilities);
    return entry.choice && !ranked.includes(entry.choice) ? [entry.choice, ...ranked] : ranked;
  };

  arms[ARMS.jevCascade] = items.map(({ id }) => {
    const entry = answer(id);
    return {
      id,
      abstained: entry.gate < gateThreshold,
      ranked: choiceRanking(entry),
      gateScore: entry.gate,
      ...usage(entry),
    };
  });
  arms[ARMS.jevUngated] = items.map(({ id }) => {
    const entry = answer(id);
    return { id, abstained: false, ranked: choiceRanking(entry), ...usage(entry) };
  });
  arms[ARMS.oracleGateJev] = items.map(({ id, expected }) => ({
    id,
    abstained: expected === null,
    ranked: choiceRanking(answer(id)),
    ...free,
  }));
  arms[ARMS.jevGateBm25] = items.map(({ id }) => {
    const entry = answer(id);
    return {
      id,
      abstained: entry.gate < gateThreshold,
      ranked: lexical(id).map(({ id: skill }) => skill),
      gateScore: entry.gate,
      ...usage(entry),
    };
  });
  return arms;
};
