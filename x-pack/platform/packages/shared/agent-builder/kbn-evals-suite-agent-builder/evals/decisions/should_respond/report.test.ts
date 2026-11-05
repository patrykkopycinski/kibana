/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArmPrediction, ReportItem } from './report';
import { buildShouldRespondReport, renderShouldRespondMarkdown } from './report';

const items: ReportItem[] = [
  { id: 'a', label: true, split: 'train', ambiguous: false },
  { id: 'b', label: false, split: 'train', ambiguous: false },
  { id: 'c', label: false, split: 'train', ambiguous: false },
  { id: 'd', label: true, split: 'test', ambiguous: false },
  { id: 'e', label: false, split: 'test', ambiguous: false },
  { id: 'f', label: false, split: 'test', ambiguous: false },
  { id: 'g', label: true, split: 'test', ambiguous: true },
];

const predict = (probabilities: Record<string, number>): ArmPrediction[] =>
  Object.entries(probabilities).map(([id, probability]) => ({
    id,
    probability,
    inputTokens: 100,
    outputTokens: 2,
    latencyMs: 700,
    costUsd: 0.0000042,
  }));

const constant = (probability: number) =>
  items.map(({ id }) => ({
    id,
    probability,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costUsd: 0,
  }));

describe('should_respond report', () => {
  // Scores sit at 0.3 for true and 0.1 for false: 0.5 misses every positive, a fit on train fixes it.
  const model = predict({ a: 0.3, b: 0.1, c: 0.1, d: 0.3, e: 0.1, f: 0.1, g: 0.2 });
  const report = buildShouldRespondReport(items, {
    model,
    always: constant(1),
    never: constant(0),
  });
  const getArm = (name: string) => {
    const arm = report.arms.find(({ arm: armName }) => armName === name);
    if (!arm) throw new Error(`missing arm ${name}`);
    return arm;
  };

  it('fits the threshold on train and reports test separately from ambiguous items', () => {
    const arm = getArm('model');
    expect(arm.fitted).toBe(true);
    expect(arm.fittedThreshold).toBe(0.3);
    expect(arm.testAtDefault.accuracy).toBeCloseTo(2 / 3);
    expect(arm.testAtFitted.accuracy).toBe(1);
    expect(arm.testAtFitted.n).toBe(3);
    expect(arm.ambiguousAtFitted?.n).toBe(1);
  });

  it('does not fit constants and gives them 0.5 balanced accuracy', () => {
    expect(getArm('always').fitted).toBe(false);
    expect(getArm('always').testAtFitted.balancedAccuracy).toBe(0.5);
    expect(getArm('never').testAtFitted.accuracy).toBeCloseTo(2 / 3);
  });

  it('computes test AUC for scored arms only, Rule 17', () => {
    // Test items: d=true @0.3, e/f=false @0.1 -> perfect ordering, AUC 1.
    expect(getArm('model').testAuc).toBeCloseTo(1);
    expect(getArm('always').testAuc).toBeUndefined();
    expect(getArm('never').testAuc).toBeUndefined();
  });

  it('reports the train-majority control and every pairwise comparison', () => {
    expect(report.majorityControl.label).toBe(false);
    expect(report.comparisons).toHaveLength(3);
    expect(report.population).toEqual({ train: 3, test: 3, ambiguous: 1, testPositives: 1 });
  });

  it('computes usage per call', () => {
    expect(getArm('model').usage).toMatchObject({
      calls: 7,
      inputTokensPerCall: 100,
      latencyP50Ms: 700,
    });
    expect(getArm('never').usage.latencyP50Ms).toBeUndefined();
  });

  it('refuses an arm that misses items', () => {
    expect(() => buildShouldRespondReport(items, { partial: model.slice(1) })).toThrow(/covers 6/);
  });

  it('renders a markdown table per section', () => {
    const markdown = renderShouldRespondMarkdown(report, { title: 'T', provenance: ['p'] });
    expect(markdown).toContain('| model | 0.30 | 3 | 3 |');
    expect(markdown).toContain('| always | constant |');
    expect(markdown).toContain('## Paired comparisons');
    expect(markdown).toContain('test AUC');
    expect(markdown).toContain('| model | 0.30 | 3 | 3 | 100.0%');
  });
});
