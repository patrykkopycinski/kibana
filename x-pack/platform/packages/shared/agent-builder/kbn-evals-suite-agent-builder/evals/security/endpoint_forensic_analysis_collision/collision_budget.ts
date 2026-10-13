/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Wall-clock budget for one per-pair collision test, sized from the work it has to do.
 *
 * Each pair runs as ONE Playwright test whose wall time scales with examples x repetitions,
 * so a constant timeout truncates the experiment as soon as reps go up: the first n30 run used
 * 40 min for 32 examples x 3 reps and stopped at 77/96 and 72/96 example-runs, dropping the
 * slowest examples, which makes the sample both smaller and biased.
 *
 * PER_RUN_BUDGET_MS is measured wall throughput, not model latency: the two truncated cells
 * completed 77 and 72 example-runs (task + 21 evaluators, 5 concurrent runs) in the 2400 s
 * budget, i.e. 31.2 s and 33.3 s of wall time per example-run. 60 s per run is ~1.8x the worst
 * observed rate, leaving room for a slow model or judge without letting a wedged run hang forever.
 */
export const PER_RUN_BUDGET_MS = 60_000;
export const MIN_TEST_BUDGET_MS = 10 * 60_000;

export const resolveRepetitions = (raw: string | undefined = process.env.EVAL_REPETITIONS) => {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const collisionTestBudgetMs = (exampleCount: number, repetitions: number): number =>
  Math.max(MIN_TEST_BUDGET_MS, exampleCount * repetitions * PER_RUN_BUDGET_MS);
