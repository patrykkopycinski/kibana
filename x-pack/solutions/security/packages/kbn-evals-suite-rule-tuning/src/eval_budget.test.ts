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

const labelCounts = () => {
  const spec = read('evals/rule_tuning_decision.spec.ts');
  const labels = [...spec.matchAll(/^ {4}expected: '([a-z_]+)'/gm)].map((m) => m[1]);
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return counts;
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

  it('states the smallest accuracy gap the fixture count can actually resolve', () => {
    // Ranking two models on this suite is a PAIRED comparison: the same fixtures are graded
    // by both, so significance comes from the fixtures they DISAGREE on (McNemar), not from
    // the raw accuracy difference. With d discordant pairs, one model must win w of them for
    // a two-sided exact p < 0.05, and the accuracy gap that represents is (w - (d - w)) / n.
    //
    // At n=35 that floor is ~0.23 absolute accuracy. Anything smaller is indistinguishable
    // from sampling noise, which is why this suite reports TIED instead of a ranking. If the
    // fixture count grows, this number drops and the guard's message stays truthful.
    const n = countFixtures();
    const twoSidedExactP = (wins: number, discordant: number) => {
      // sum of binomial(discordant, k) for k >= wins, at p=0.5, doubled for two-sided
      let tail = 0;
      for (let k = wins; k <= discordant; k++) {
        let coefficient = 1;
        for (let j = 0; j < k; j++) coefficient = (coefficient * (discordant - j)) / (j + 1);
        tail += coefficient;
      }
      return (tail / 2 ** discordant) * 2;
    };

    // A realistic discordance for two models near this suite's accuracy band.
    const discordant = 12;
    let winsNeeded = discordant;
    for (let w = Math.floor(discordant / 2) + 1; w <= discordant; w++) {
      if (twoSidedExactP(w, discordant) < 0.05) {
        winsNeeded = w;
        break;
      }
    }
    const minDetectableGap = (winsNeeded - (discordant - winsNeeded)) / n;

    // The suite must not silently become one that claims to resolve gaps it cannot. If a
    // future n makes this floor better than 0.10, the TIED language in the report is stale
    // and must be revisited deliberately rather than by accident.
    expect(minDetectableGap).toBeGreaterThan(0.1);
    expect(minDetectableGap).toBeLessThanOrEqual(0.35);
  });

  it('keeps the majority class small enough that a constant answer cannot look competent', () => {
    // A single-label suite is trivially gamed: a model that always answers the most common
    // change_type scores the majority share while demonstrating no discrimination at all. That
    // baseline is the floor any reported accuracy must beat, so pin it where it stays meaningful.
    // 12 fixtures were relabelled to `manual` when the merged workflow dropped `suppression` and
    // `disable` from its enum, which pushed `manual` to 17/35 - close enough to half that the
    // guard is worth having.
    const counts = labelCounts();
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const majority = Math.max(...counts.values());

    expect(total).toBeGreaterThan(0);
    expect(majority / total).toBeLessThanOrEqual(0.5);
  });

  it('keeps every change_type the workflow can emit represented in the fixtures', () => {
    // A label the workflow can no longer emit is unscoreable: every fixture carrying it is a
    // guaranteed zero that reads as a model failure. Tie the golden labels to the enum so a
    // workflow change that drops a change_type fails here instead of silently in a 7-hour run.
    const workflow = readFileSync(
      join(
        __dirname,
        '../../../../../../src/platform/packages/shared/kbn-workflows/managed/definitions/pnd/rule_tuning.yaml'
      ),
      'utf8'
    );
    const enumMatch = workflow.match(/change_type:\s*\n\s*type: string\s*\n\s*enum: \[([^\]]+)\]/);
    if (!enumMatch) throw new Error('rule_tuning.yaml no longer declares a change_type enum');
    const allowed = enumMatch[1].split(',').map((value) => value.trim());

    for (const label of labelCounts().keys()) {
      expect(allowed).toContain(label);
    }
  });
});
