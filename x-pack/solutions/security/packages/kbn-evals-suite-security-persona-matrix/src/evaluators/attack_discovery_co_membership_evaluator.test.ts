/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
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
  CHRYSALIS_CORPUS_WINDOW,
  CHRYSALIS_REFERENCE_STATUS,
  CHRYSALIS_REFERENCE_TOTAL_ALERTS,
} from '../datasets/chrysalis_reference';
import { buildChrysalisGenerateApiExamples } from '../datasets/chrysalis_generate_api_examples';
import { CHRYSALIS_LIVE_CORPUS } from '../datasets/chrysalis_live_corpus_fixture';

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

  it('duplicate output groups do not inflate recall above 1', () => {
    const s = scoreCoMembership({
      outputGroups: [
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['d', 'e'],
      ],
      referenceChains: reference,
    });
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
    expect(s.f1).toBe(1);
  });

  it('a repeated id within a group forms no self-pair', () => {
    const s = scoreCoMembership({
      outputGroups: [['a', 'a', 'b']],
      referenceChains: reference,
    });
    // only the distinct pair (a,b) exists; it is a true pair
    expect(s.precision).toBe(1);
    expect(s.recall).toBeCloseTo(1 / 4);
    expect(s.label).toBe('1/1 pairs');
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

  it('M2: empty expected output is labeled no_reference with a null score', async () => {
    const result = await evaluator.evaluate({
      input: example.input,
      output: { insights: [{ alertIds: ['a'] }] } as never,
      expected: { attackDiscoveries: [] },
      metadata: {},
    });
    expect(result.label).toBe('no_reference');
    expect(result.score).toBeNull();
    expect(result.metadata).toMatchObject({ reference_status: 'unsigned' });
  });

  it('records the unsigned reference status in result metadata', async () => {
    const result = await evaluator.evaluate({
      input: example.input,
      output: { insights: [{ alertIds: ['a', 'b', 'c'] }] } as never,
      expected: example.output,
      metadata: {},
    });
    expect(result.metadata).toMatchObject({
      precision: 1,
      recall: 1,
      reference_status: 'unsigned',
    });
  });

  it('task errors score null with label error instead of 0', async () => {
    const result = await evaluator.evaluate({
      input: example.input,
      output: { insights: null, errors: ['connector timeout'] } as never,
      expected: example.output,
      metadata: {},
    });
    expect(result.score).toBeNull();
    expect(result.label).toBe('error');
    expect(result.metadata).toMatchObject({ reference_status: 'unsigned' });
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

  it('every reference alert id is a live alert uuid from the restored snapshot', () => {
    const liveUuids = new Set(CHRYSALIS_LIVE_CORPUS.map((a) => a.alertUuid));
    expect(liveUuids.size).toBe(CHRYSALIS_REFERENCE_TOTAL_ALERTS);
    for (const chain of CHRYSALIS_REFERENCE_CHAINS) {
      for (const alertId of chain.alertIds) {
        expect(alertId).toMatch(/^[0-9a-f]{64}$/);
        expect(liveUuids.has(alertId)).toBe(true);
      }
    }
  });

  it('each chain contains only alerts of its own episode, and covers the episode', () => {
    const episodeOf = new Map(CHRYSALIS_LIVE_CORPUS.map((a) => [a.alertUuid, a.episode]));
    for (const [ep, expectedCount] of Object.entries(EPISODE_ALERT_COUNTS)) {
      const ids = CHRYSALIS_REFERENCE_CHAINS.filter((c) => c.episode === Number(ep)).flatMap(
        (c) => c.alertIds
      );
      expect(ids).toHaveLength(expectedCount);
      for (const id of ids) expect(episodeOf.get(id)).toBe(Number(ep));
    }
  });

  it('episode windows select exactly the per-episode alert counts from the live fixture', () => {
    expect(CHRYSALIS_EPISODE_WINDOWS).toHaveLength(8);
    const inWindow = (ts: string, w: { start: string; end: string }) =>
      ts >= w.start && ts <= w.end; // the generate API filters gte/lte (end inclusive)
    for (const w of CHRYSALIS_EPISODE_WINDOWS) {
      const selected = CHRYSALIS_LIVE_CORPUS.filter((a) => inWindow(a.timestamp, w));
      expect(selected).toHaveLength(EPISODE_ALERT_COUNTS[w.episode] as number);
      expect(selected.every((a) => a.episode === w.episode)).toBe(true);
    }
    const all = CHRYSALIS_LIVE_CORPUS.filter((a) => inWindow(a.timestamp, CHRYSALIS_CORPUS_WINDOW));
    expect(all).toHaveLength(CHRYSALIS_REFERENCE_TOTAL_ALERTS);
  });

  it('episode windows are disjoint and ordered', () => {
    for (let i = 1; i < CHRYSALIS_EPISODE_WINDOWS.length; i++) {
      const prev = CHRYSALIS_EPISODE_WINDOWS[i - 1] as { end: string };
      const cur = CHRYSALIS_EPISODE_WINDOWS[i] as { start: string };
      expect(prev.end < cur.start).toBe(true);
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

  it('per-episode examples use the episode windows and expect only that episode alerts', () => {
    const { perEpisode } = buildChrysalisGenerateApiExamples('conn-1');
    for (const [i, ex] of perEpisode.entries()) {
      const w = CHRYSALIS_EPISODE_WINDOWS[i] as { start: string; end: string; episode: number };
      expect(ex.input).toMatchObject({ start: w.start, end: w.end });
      const expectedIds = new Set(
        CHRYSALIS_LIVE_CORPUS.filter((a) => a.timestamp >= w.start && a.timestamp <= w.end).map(
          (a) => a.alertUuid
        )
      );
      const ids = (ex.output?.attackDiscoveries ?? []).flatMap((d) => d.alertIds);
      expect(new Set(ids)).toEqual(expectedIds);
    }
  });

  it('full-corpus example expects all 9 chains / 95 alerts', () => {
    const { fullCorpus } = buildChrysalisGenerateApiExamples('conn-1');
    expect(fullCorpus.output?.attackDiscoveries).toHaveLength(9);
    expect(fullCorpus.output?.attackDiscoveries.flatMap((d) => d.alertIds)).toHaveLength(95);
  });
});
