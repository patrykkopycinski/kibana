/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  collisionTestBudgetMs,
  MIN_TEST_BUDGET_MS,
  PER_RUN_BUDGET_MS,
  resolveRepetitions,
} from './collision_budget';
import { COLLISION_EXAMPLES } from './collision_dataset_n30';

// Worst measured wall time per example-run in the truncated n30 cells (72 runs in 2400 s).
const OBSERVED_WORST_MS_PER_RUN = 2_400_000 / 72;

describe('collision test budget', () => {
  const pairSizes = COLLISION_EXAMPLES.reduce<Record<string, number>>((acc, { metadata }) => {
    acc[metadata.pair] = (acc[metadata.pair] ?? 0) + 1;
    return acc;
  }, {});

  it.each([1, 3, 5])(
    'covers every pair at %i reps with >=1.5x headroom over observed throughput',
    (reps) => {
      for (const [pair, size] of Object.entries(pairSizes)) {
        const needed = size * reps * OBSERVED_WORST_MS_PER_RUN * 1.5;
        expect({ pair, ok: collisionTestBudgetMs(size, reps) >= needed }).toEqual({
          pair,
          ok: true,
        });
      }
    }
  );

  it('the 40-minute constant it replaces could not fit a 32-example pair at 3 reps', () => {
    expect(32 * 3 * OBSERVED_WORST_MS_PER_RUN).toBeGreaterThan(40 * 60_000);
    expect(collisionTestBudgetMs(32, 3)).toBe(32 * 3 * PER_RUN_BUDGET_MS);
  });

  it('scales with repetitions and keeps a floor for tiny scopes', () => {
    expect(collisionTestBudgetMs(32, 3)).toBe(3 * collisionTestBudgetMs(32, 1));
    expect(collisionTestBudgetMs(1, 1)).toBe(MIN_TEST_BUDGET_MS);
  });

  it('reads EVAL_REPETITIONS and falls back to 1', () => {
    expect(resolveRepetitions('3')).toBe(3);
    expect(resolveRepetitions(undefined)).toBe(1);
    expect(resolveRepetitions('0')).toBe(1);
    expect(resolveRepetitions('abc')).toBe(1);
  });
});
