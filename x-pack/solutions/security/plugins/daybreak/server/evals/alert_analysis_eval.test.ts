/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BROKEN_EXAMPLE_IDS,
  NOMINAL_EXAMPLE_IDS,
  daybreakGoldenDataset,
  type DaybreakGoldenExample,
  type ExpectedProposalShape,
} from './golden_dataset';
import {
  reasonOverAlertEvidence,
  runOfflineExperiment,
  scoreProposalShape,
  type ShapeMatchEvaluator,
} from './offline_dataset_gate';

describe('daybreak alert-analysis offline eval gate (FR-8, FR-10, A-3)', () => {
  const shapeMatchEvaluator: ShapeMatchEvaluator = {
    name: 'proposal-shape-match',
    kind: 'CODE',
    evaluate: async ({ output, expected }) => scoreProposalShape(output, expected),
  };

  const task = async (example: DaybreakGoldenExample): Promise<ExpectedProposalShape> =>
    reasonOverAlertEvidence(example.input.alertEvidence);

  // FR-8 — every nominal (non-broken) row's worker output must match its golden
  // expected Proposal shape. If any nominal row scores 0, the worker regressed.
  it('scores every nominal row as a passing shape match (FR-8)', async () => {
    const [result] = await runOfflineExperiment({
      dataset: daybreakGoldenDataset,
      task,
      evaluators: [shapeMatchEvaluator],
    });

    for (const exampleId of NOMINAL_EXAMPLE_IDS) {
      const run = result.evaluationRuns.find((r) => r.exampleId === exampleId);
      expect(run).toBeDefined();
      expect(run?.result.score).toBe(1);
    }
  });

  // FR-10 / A-3 — the deliberately-broken row carries a flipped expected shape
  // (dismiss a critical ransomware true positive). The gate MUST score it 0,
  // proving it catches real regressions rather than matching anything.
  it('scores the deliberately-broken row as a failing mismatch (FR-10, A-3)', async () => {
    const [result] = await runOfflineExperiment({
      dataset: daybreakGoldenDataset,
      task,
      evaluators: [shapeMatchEvaluator],
    });

    for (const exampleId of BROKEN_EXAMPLE_IDS) {
      const run = result.evaluationRuns.find((r) => r.exampleId === exampleId);
      expect(run).toBeDefined();
      expect(run?.result.score).toBe(0);
      expect(run?.result.explanation.length).toBeGreaterThan(0);
    }
  });

  // A-3 robustness — the broken row flips severity, status, confidence, AND
  // recommendation. The gate must flag at least two independent mismatches so
  // a single-field false-negative cannot mask the regression.
  it('catches the broken row on multiple independent fields (A-3 robustness)', async () => {
    const [result] = await runOfflineExperiment({
      dataset: daybreakGoldenDataset,
      task,
      evaluators: [shapeMatchEvaluator],
    });

    const brokenRun = result.evaluationRuns.find((r) => r.exampleId === BROKEN_EXAMPLE_IDS[0]);
    expect(brokenRun).toBeDefined();
    expect(brokenRun?.result.score).toBe(0);

    const mismatchCount = brokenRun?.result.explanation.split(';').length ?? 0;
    expect(mismatchCount).toBeGreaterThanOrEqual(2);
  });

  // FR-8 full-gate contract — the offline dataset gate passes if and only if
  // all nominal rows match AND every broken row fails. This is the exact
  // pass/fail assertion a CI gate would enforce.
  it('passes the full offline gate — all nominal pass AND broken fails (FR-8)', async () => {
    const [result] = await runOfflineExperiment({
      dataset: daybreakGoldenDataset,
      task,
      evaluators: [shapeMatchEvaluator],
    });

    const scoresByExample = new Map(
      result.evaluationRuns.map((r) => [r.exampleId, r.result.score] as const)
    );

    const allNominalPass = NOMINAL_EXAMPLE_IDS.every((id) => scoresByExample.get(id) === 1);
    const allBrokenFail = BROKEN_EXAMPLE_IDS.every((id) => scoresByExample.get(id) === 0);

    expect(allNominalPass).toBe(true);
    expect(allBrokenFail).toBe(true);
  });
});
