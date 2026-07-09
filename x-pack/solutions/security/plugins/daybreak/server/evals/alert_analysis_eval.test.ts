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
  type AlertEvidence,
  type DaybreakGoldenExample,
  type ExpectedProposalShape,
} from './golden_dataset';

/**
 * Confidence band for the shape-match scorer. The Reason phase emits a weighted
 * float; the gate accepts any value within this tolerance of the golden value.
 * Tight enough that the broken row's flipped confidence (~0.9 actual vs ~0.1
 * expected) falls well outside (FR-10 / A-3).
 */
const CONFIDENCE_TOLERANCE = 0.15;

/**
 * Structural mirror of `@kbn/evals`'s `EvaluationResult`. The daybreak plugin
 * deliberately does not depend on `@kbn/evals` (a `devOnly` test-helper — see
 * `golden_dataset.ts`); these local types are shape-identical so this offline
 * gate lifts verbatim into a future `kbn-evals-suite-daybreak` package that
 * imports `@kbn/evals` directly.
 */
interface ShapeMatchEvaluationResult {
  score: number;
  label: string;
  explanation: string;
}

/**
 * Structural mirror of `@kbn/evals`'s `Evaluator` (CODE kind only — the offline
 * gate is deterministic; no LLM-as-judge).
 */
interface ShapeMatchEvaluator {
  name: string;
  kind: 'CODE';
  evaluate: (params: {
    input: DaybreakGoldenExample['input'];
    output: ExpectedProposalShape;
    expected: DaybreakGoldenExample['output'];
    metadata: DaybreakGoldenExample['metadata'];
  }) => Promise<ShapeMatchEvaluationResult>;
}

/** A single task run — the Proposal shape the worker produced for one example. */
interface ShapeMatchExampleRun {
  exampleId: string;
  output: ExpectedProposalShape;
}

/** A single evaluator run — the score for one example under one evaluator. */
interface ShapeMatchEvaluationRun {
  evaluatorName: string;
  exampleId: string;
  result: ShapeMatchEvaluationResult;
}

/**
 * Structural mirror of `@kbn/evals`'s `DatasetRunResult`. Returned by
 * {@link runOfflineExperiment} so suite-level assertions can index per-example
 * scores the same way a real `executorClient.runExperiment` consumer would.
 */
interface ShapeMatchDatasetRunResult {
  experimentName: string;
  datasetName: string;
  runs: ShapeMatchExampleRun[];
  evaluationRuns: ShapeMatchEvaluationRun[];
}

const ESCALATE_POLARITY = 'escalate';
const DISMISS_POLARITY = 'dismiss';
const NEUTRAL_POLARITY = 'neutral';
type RecommendationPolarity =
  | typeof ESCALATE_POLARITY
  | typeof DISMISS_POLARITY
  | typeof NEUTRAL_POLARITY;

/**
 * Reduce a free-form recommendation to its escalate/dismiss polarity so the
 * scorer can compare intent without brittle exact-string matching on prose.
 */
const recommendationPolarity = (recommendation: string | undefined): RecommendationPolarity => {
  const text = (recommendation ?? '').toLowerCase();
  const escalate = text.includes('escal');
  const dismiss = text.includes('dismiss');
  if (escalate && !dismiss) return ESCALATE_POLARITY;
  if (dismiss && !escalate) return DISMISS_POLARITY;
  return NEUTRAL_POLARITY;
};

/**
 * The shape-match scorer (FR-8 "scores the actual Proposal against the expected
 * shape"). Compares the deterministic, semantically-meaningful fields of
 * {@link ExpectedProposalShape}:
 * - categorical (`capability`, `severity`, `status`): exact equality
 * - numeric (`confidence`): within {@link CONFIDENCE_TOLERANCE}
 * - prose (`recommendation`): escalate/dismiss polarity agreement
 * - `title`: non-empty (free-form prose, weak check)
 *
 * Returns score `1` (match) when every field agrees, `0` (mismatch) otherwise,
 * carrying the mismatch list in `explanation` for diagnostics.
 */
const scoreProposalShape = (
  actual: ExpectedProposalShape,
  expected: ExpectedProposalShape
): ShapeMatchEvaluationResult => {
  const mismatches: string[] = [];

  if (actual.capability !== expected.capability) {
    mismatches.push(`capability '${actual.capability}' !== '${expected.capability}'`);
  }
  if (actual.severity !== expected.severity) {
    mismatches.push(`severity '${actual.severity}' !== '${expected.severity}'`);
  }
  if (actual.status !== expected.status) {
    mismatches.push(`status '${actual.status}' !== '${expected.status}'`);
  }
  if (Math.abs(actual.confidence - expected.confidence) > CONFIDENCE_TOLERANCE) {
    mismatches.push(
      `confidence ${actual.confidence} outside ±${CONFIDENCE_TOLERANCE} of ${expected.confidence}`
    );
  }

  const actualPolarity = recommendationPolarity(actual.recommendation);
  const expectedPolarity = recommendationPolarity(expected.recommendation);
  if (actualPolarity !== expectedPolarity) {
    mismatches.push(`recommendation polarity '${actualPolarity}' !== '${expectedPolarity}'`);
  }

  if (!actual.title || actual.title.trim().length === 0) {
    mismatches.push('title is empty');
  }

  if (mismatches.length === 0) {
    return {
      score: 1,
      label: 'match',
      explanation: 'Proposal shape matches the expected golden shape.',
    };
  }

  return {
    score: 0,
    label: 'mismatch',
    explanation: mismatches.join('; '),
  };
};

const SEVERITY_WEIGHT: Record<AlertEvidence['severity'], number> = {
  low: 0,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

/**
 * The offline worker reasoning function (FR-8 "runs each row through the
 * worker's reasoning logic"). Deterministic over {@link AlertEvidence} so the
 * gate is reproducible without a live model call.
 *
 * Mirrors the Reason phase's triage logic: stance-signal balance decides
 * true-positive vs false-positive; severity weight anchors confidence; the two
 * together drive status and recommendation polarity — the same fields the real
 * worker weighs before emitting a Proposal.
 */
const reasonOverAlertEvidence = (evidence: AlertEvidence): ExpectedProposalShape => {
  const forStance = evidence.stanceSignals.filter((s) => s.stance === 'for').length;
  const againstStance = evidence.stanceSignals.filter((s) => s.stance === 'against').length;
  const isTruePositive = forStance > againstStance;
  const severityWeight = SEVERITY_WEIGHT[evidence.severity];

  const confidence = isTruePositive
    ? Math.min(0.95, 0.6 + 0.3 * severityWeight)
    : Math.max(0.05, 0.4 - 0.3 * (1 - severityWeight));

  const status: ExpectedProposalShape['status'] = isTruePositive
    ? severityWeight >= 0.75
      ? 'escalated'
      : 'new'
    : 'dismissed';

  const recommendation = isTruePositive
    ? `Escalate — ${evidence.summary}`
    : `Dismiss — ${evidence.summary}`;

  return {
    title: `${evidence.ruleName} on ${evidence.alertId}`,
    capability: 'detection',
    severity: evidence.severity,
    confidence,
    status,
    recommendation,
  };
};

/**
 * Minimal in-process mirror of `@kbn/evals`'s
 * `EvalsExecutorClient.runExperiment`. Iterates each example through the task
 * (worker reasoning) then through each evaluator (shape-match scorer),
 * returning per-example results indexed by example id.
 *
 * Kept structural with the real contract so swapping this for
 * `executorClient.runExperiment` in a future `kbn-evals-suite-daybreak` package
 * is a drop-in change.
 */
const runOfflineExperiment = async (params: {
  dataset: typeof daybreakGoldenDataset;
  task: (example: DaybreakGoldenExample) => Promise<ExpectedProposalShape>;
  evaluators: ShapeMatchEvaluator[];
}): Promise<ShapeMatchDatasetRunResult[]> => {
  const { dataset, task, evaluators } = params;
  const runs: ShapeMatchExampleRun[] = [];
  const evaluationRuns: ShapeMatchEvaluationRun[] = [];

  for (const example of dataset.examples) {
    const output = await task(example);
    runs.push({ exampleId: example.id, output });

    for (const evaluator of evaluators) {
      const result = await evaluator.evaluate({
        input: example.input,
        output,
        expected: example.output,
        metadata: example.metadata,
      });
      evaluationRuns.push({
        evaluatorName: evaluator.name,
        exampleId: example.id,
        result,
      });
    }
  }

  return [
    {
      experimentName: dataset.name,
      datasetName: dataset.name,
      runs,
      evaluationRuns,
    },
  ];
};

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
