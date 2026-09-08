/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The suite runs every fixture inside ONE `evaluate()` test. The tuning workflow's concurrency
 * group is `max:1 strategy:drop`, so the experiment is pinned to `concurrency: 1` and wall time
 * scales linearly with fixture count x repetitions.
 *
 * A budget smaller than that product does not "flake" — it kills every attempt with
 * `Test timeout of Nms exceeded` no matter how good the model is, and the run reports a model
 * failure that is really a config bug. Growing the fixture list without growing the budget is
 * exactly how that happens, so assert the relationship instead of trusting a hand-tuned number.
 */
const SECONDS_PER_FIXTURE = 233; // measured: 6 fixtures ran 1396s wall on a smoke VM

const read = (relativePath: string) => readFileSync(join(__dirname, '..', relativePath), 'utf8');

const countFixtures = () => {
  const spec = read('evals/rule_tuning_decision.spec.ts');
  const ids = spec.match(/^ {4}id: '/gm) ?? [];
  return ids.length;
};

const configuredTimeoutMs = () => {
  const config = read('playwright.config.ts');
  const match = config.match(/timeout:\s*([\d\s*_]+?),/);
  if (!match) throw new Error('playwright.config.ts no longer declares a `timeout`');
  // The declaration is written as a product of literals (e.g. `8 * 60 * 60_000`). Multiply the
  // factors directly rather than eval()ing repo text.
  return match[1]
    .replace(/_/g, '')
    .split('*')
    .map((factor) => Number(factor.trim()))
    .reduce((product, factor) => product * factor, 1);
};

const configuredRepetitions = () => {
  const config = read('playwright.config.ts');
  const match = config.match(/repetitions:\s*(\d+)/);
  if (!match) throw new Error('playwright.config.ts no longer declares `repetitions`');
  return Number(match[1]);
};

describe('rule-tuning eval budget', () => {
  it('gives the single evaluate() test enough wall clock for every fixture and repetition', () => {
    const fixtures = countFixtures();
    const repetitions = configuredRepetitions();
    const requiredMs = fixtures * repetitions * SECONDS_PER_FIXTURE * 1000;

    expect(fixtures).toBeGreaterThan(0);
    expect(configuredTimeoutMs()).toBeGreaterThanOrEqual(requiredMs);
  });

  it('keeps the fixture count at or above the n=30 threshold for a rankable result', () => {
    // Below n=30 the Wilson interval is too wide to separate models; the suite is then only
    // honest as a TIED result. Guard the sizing decision so a fixture deletion is deliberate.
    expect(countFixtures()).toBeGreaterThanOrEqual(30);
  });
});
