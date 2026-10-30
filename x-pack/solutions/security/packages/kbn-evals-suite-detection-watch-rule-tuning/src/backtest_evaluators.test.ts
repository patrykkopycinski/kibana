/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  fpSuppressedShare,
  tpSuppressedByTuning,
  type VariantVerdict,
} from './backtest_evaluators';

const tp = { 'host.name': 'tp-1', 'process.name': 'java' };
const fps = [
  { 'host.name': 'fp-1', 'process.name': 'java' },
  { 'host.name': 'fp-2', 'process.name': 'java' },
];

const verdict = (overrides: Partial<VariantVerdict>): VariantVerdict =>
  ({
    executionId: 'exec-1',
    executionStatus: 'completed',
    seededAlerts: { tp: [tp], fp: fps },
    ...overrides,
  } as VariantVerdict);

const run = (evaluator: typeof tpSuppressedByTuning, output: VariantVerdict) =>
  evaluator.evaluate!({ output, expected: {} } as never);

describe('tpSuppressedByTuning', () => {
  it('scores 0 when the proposal would suppress a seeded TP', async () => {
    const result = await run(
      tpSuppressedByTuning,
      verdict({
        change_type: 'exception',
        exception_entries: [{ field: 'process.name', operator: 'is', value: 'java' }],
      })
    );
    expect(result.score).toBe(0);
    expect(result.label).toBe('fail');
  });

  it('scores 1 when every TP is retained', async () => {
    const result = await run(
      tpSuppressedByTuning,
      verdict({
        change_type: 'exception',
        exception_entries: [{ field: 'host.name', operator: 'is', value: 'fp-1' }],
      })
    );
    expect(result.score).toBe(1);
    expect(result.label).toBe('pass');
  });

  it('fails closed (0) on a query outside the replay dialect', async () => {
    const result = await run(
      tpSuppressedByTuning,
      verdict({ change_type: 'query', proposed_query: 'not process.name:java' })
    );
    expect(result.score).toBe(0);
    expect(result.label).toBe('unparseable');
  });

  it.each(['risk_score', 'threshold', 'schedule', 'manual'] as const)(
    'scores %s N/A, never a free pass',
    async (changeType) => {
      const result = await run(tpSuppressedByTuning, verdict({ change_type: changeType }));
      expect(result.score).toBeNull();
      expect(result.label).toBe('not_modeled');
    }
  );
});

describe('fpSuppressedShare', () => {
  it('reports the share of seeded FPs the proposal removes', async () => {
    const result = await run(
      fpSuppressedShare,
      verdict({
        change_type: 'exception',
        exception_entries: [{ field: 'host.name', operator: 'is', value: 'fp-1' }],
      })
    );
    expect(result.score).toBe(0.5);
    expect(result.label).toBe('1/2');
  });

  it('is N/A when the branch is not modelled', async () => {
    const result = await run(fpSuppressedShare, verdict({ change_type: 'manual' }));
    expect(result.score).toBeNull();
  });

  it('is N/A when the proposal cannot be replayed', async () => {
    const result = await run(
      fpSuppressedShare,
      verdict({ change_type: 'query', proposed_query: 'not process.name:java' })
    );
    expect(result.score).toBeNull();
  });

  it('is N/A when no FP alerts were seeded', async () => {
    const result = await run(
      fpSuppressedShare,
      verdict({
        change_type: 'exception',
        exception_entries: [{ field: 'host.name', operator: 'is', value: 'fp-1' }],
        seededAlerts: { tp: [tp], fp: [] },
      })
    );
    expect(result.score).toBeNull();
  });
});
