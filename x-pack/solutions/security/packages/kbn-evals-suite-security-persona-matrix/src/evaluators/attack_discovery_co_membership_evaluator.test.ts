/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0. Use of this file is governed by the Elastic License 2.0
 * that can be found in the licenses directory at the root of this repository.
 */

import { ToolingLog } from '@kbn/tooling-log';
import {
  ATTACK_DISCOVERY_CO_MEMBERSHIP_EVALUATOR_NAME,
  createAttackDiscoveryCoMembershipEvaluator,
  scoreCoMembership,
} from './attack_discovery_co_membership_evaluator';
import {
  CHRYSALIS_EPISODE_WINDOWS,
  CHRYSALIS_REFERENCE_CHAINS,
  CHRYSALIS_REFERENCE_STATUS,
  CHRYSALIS_REFERENCE_TOTAL_ALERTS,
} from '../datasets/chrysalis_reference';
import { buildChrysalisGenerateApiExamples } from '../datasets/chrysalis_generate_api_examples';

const log = new ToolingLog();

const EPISODE_ALERT_COUNTS: Record<number, number> = {
  1: 9,
  2: 11,
  3: 32,
  4: 16,
  5: 5,
  6: 5,
  7: 6,
  8: 11,
};

describe('scoreCoMembership', () => {
  const reference = [
    ['a', 'b', 'c'], // 3 pairs
    ['d', 'e'], // 1 pair
  ];

  it('positive control: reference as output scores 1', () => {
    const s = scoreCoMembership({ outputGroups: reference, referenceChains: reference });
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.f1).toBe(1);
  });

  it('M4: nonexistent reference ids give recall 0', () => {
    const wrongRef = [
      ['x1', 'x2'],
      ['y1', 'y2'],
    ];
    const s = scoreCoMembership({ outputGroups: reference, referenceChains: wrongRef });
    expect(s.recall).toBe(0);
    expect(s.f1).toBe(0);
  });

  it('M5: all chains merged keeps recall, drops precision', () => {
    const merged = [['a', 'b', 'c', 'd', 'e']];
    const s = scoreCoMembership({ outputGroups: merged, referenceChains: reference });
    expect(s.recall).toBe(1);
    expect(s.precision).toBeLessThan(1);
    // 4 true pairs of 10 output pairs
    expect(s.precision).toBeCloseTo(0.4);
  });

  it('split-all: precision holds at 1 only when splits respect chains', () => {
    const splitAll = [['a', 'b'], ['c'], ['d', 'e']];
    const s = scoreCoMembership({ outputGroups: splitAll, referenceChains: reference });
    expect(s.precision).toBe(1);
    expect(s.recall).toBeLessThan(1); // (a,c),(b,c) pairs lost
  });

  it('drop-episode: removing a chain from the output lowers recall', () => {
    const dropped = [reference[0]!];
    const s = scoreCoMembership({ outputGroups: dropped, referenceChains: reference });
    expect(s.recall).toBeCloseTo(3 / 4);
    expect(s.precision).toBe(1);
  });

  it('wrong-host: replacing an alert id with an unknown one lowers precision', () => {
    const wrongHost = [
      ['a', 'b', 'zzz'],
      ['d', 'e'],
    ];
    const s = scoreCoMembership({ outputGroups: wrongHost, referenceChains: reference });
    expect(s.precision).toBeCloseTo(0.5); // (a,zzz),(b,zzz) false; (a,b),(d,e) true
    expect(s.recall).toBeCloseTo(0.5); // (a,c),(b,c) reference pairs are not recovered
  });

  it('M2: empty reference labels no_reference and scores null', () => {
    const s = scoreCoMembership({ outputGroups: reference, referenceChains: [] });
    expect(s.label).toBe('no_reference');
    expect(s.f1).toBeNull();
  });

  it('empty output groups score recall 0 with no_output_groups label', () => {
    const s = scoreCoMembership({ outputGroups: [], referenceChains: reference });
    expect(s.label).toBe('no_output_groups');
    expect(s.recall).toBe(0);
  });
});

describe('createAttackDiscoveryCoMembershipEvaluator', () => {
  const evaluator = createAttackDiscoveryCoMembershipEvaluator({ log });

  it('exposes a maximize CODE evaluator', () => {
    expect(evaluator.name).toBe(ATTACK_DISCOVERY_CO_MEMBERSHIP_EVALUATOR_NAME);
    expect(evaluator.kind).toBe('CODE');
    expect(evaluator.direction).toBe('maximize');
  });

  const example = {
    input: { mode: 'generateApi' as const, connectorId: 'c1' },
    output: {
      attackDiscoveries: [
        {
          title: 't',
          summaryMarkdown: 's',
          detailsMarkdown: 'd',
          alertIds: ['a', 'b', 'c'],
        },
      ],
    },
    metadata: {},
  };

  it('M1 (wrong reference): score falls below the perfect-output score', async () => {
    const perfect = await evaluator.evaluate({
      input: example.input,
      output: { insights: [{ alertIds: ['a', 'b', 'c'] }] } as never,
      expected: example.output,
      metadata: {},
    });
    const wrong = await evaluator.evaluate({
      input: example.input,
      output: { insights: [{ alertIds: ['a', 'b', 'c'] }] } as never,
      expected: {
        attackDiscoveries: [
          { title: 't', summaryMarkdown: 's', detailsMarkdown: 'd', alertIds: ['q', 'r', 's'] },
        ],
      },
      metadata: {},
    });
    expect(perfect.score).toBe(1);
    expect(wrong.score).toBe(0);
  });

  it('M2: empty expected output is labeled no_reference with score 0', async () => {
    const result = await evaluator.evaluate({
      input: example.input,
      output: { insights: [{ alertIds: ['a'] }] } as never,
      expected: { attackDiscoveries: [] },
      metadata: {},
    });
    expect(result.label).toBe('no_reference');
    expect(result.score).toBe(0);
  });

  it('reads snake_case alert_ids from generateApi wire shapes', async () => {
    const result = await evaluator.evaluate({
      input: example.input,
      output: { insights: [{ alert_ids: ['a', 'b', 'c'] }] } as never,
      expected: example.output,
      metadata: {},
    });
    expect(result.score).toBe(1);
  });
});

describe('Chrysalis reference dataset', () => {
  it('covers all 95 alerts exactly once across 9 chains', () => {
    const all = CHRYSALIS_REFERENCE_CHAINS.flatMap((c) => c.alertIds);
    expect(all).toHaveLength(CHRYSALIS_REFERENCE_TOTAL_ALERTS);
    expect(new Set(all).size).toBe(CHRYSALIS_REFERENCE_TOTAL_ALERTS);
  });

  it('every chain id matches its alert ids host suffix and 3-digit index', () => {
    for (const chainRef of CHRYSALIS_REFERENCE_CHAINS) {
      for (const alertId of chainRef.alertIds) {
        expect(alertId).toMatch(/^dhrumil-insights-gold-v1-\d{3}-[A-Z0-9-]+$/);
      }
    }
  });

  it('per-episode alert counts match the committed episode files', () => {
    for (const [ep, expectedCount] of Object.entries(EPISODE_ALERT_COUNTS)) {
      const actual =
        CHRYSALIS_REFERENCE_CHAINS.filter((c) => c.episode === Number(ep))
          .flatMap((c) => c.alertIds)
          .filter((id) => !id.endsWith('-PRIV')).length +
        CHRYSALIS_REFERENCE_CHAINS.filter((c) => c.episode === Number(ep))
          .flatMap((c) => c.alertIds)
          .filter((id) => id.endsWith('-PRIV')).length;
      expect(actual).toBe(expectedCount);
    }
  });

  it('episode windows are contiguous UTC days covering 2026-03-19..27', () => {
    expect(CHRYSALIS_EPISODE_WINDOWS).toHaveLength(8);
    for (const w of CHRYSALIS_EPISODE_WINDOWS) {
      expect(w.start).toBe(`2026-03-${String(18 + w.episode).padStart(2, '0')}T00:00:00.000Z`);
      expect(w.end).toBe(`2026-03-${String(19 + w.episode).padStart(2, '0')}T00:00:00.000Z`);
    }
  });

  it('reference status is unsigned (internal only)', () => {
    expect(CHRYSALIS_REFERENCE_STATUS).toBe('unsigned');
  });
});

describe('buildChrysalisGenerateApiExamples', () => {
  it('yields 8 per-episode examples plus one full-corpus example, all generateApi', () => {
    const { perEpisode, fullCorpus } = buildChrysalisGenerateApiExamples('conn-1');
    expect(perEpisode).toHaveLength(8);
    expect(fullCorpus.input?.mode).toBe('generateApi');
    for (const ex of perEpisode) {
      expect(ex.input?.mode).toBe('generateApi');
    }
  });

  it('M3 sanity: episode window mismatch is detectable — each window selects only its chains', () => {
    const { perEpisode } = buildChrysalisGenerateApiExamples('conn-1');
    for (const [i, ex] of perEpisode.entries()) {
      const chains = ex.output?.attackDiscoveries ?? [];
      const expectedChains = CHRYSALIS_REFERENCE_CHAINS.filter((c) => c.episode === i + 1);
      expect(chains).toHaveLength(expectedChains.length);
    }
  });

  it('full-corpus example expects all 9 chains / 95 alerts', () => {
    const { fullCorpus } = buildChrysalisGenerateApiExamples('conn-1');
    expect(fullCorpus.output?.attackDiscoveries).toHaveLength(9);
    expect(fullCorpus.output?.attackDiscoveries.flatMap((d) => d.alertIds)).toHaveLength(95);
  });
});
