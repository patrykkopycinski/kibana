/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * LOCAL PROBE (not part of the PR; worktree-only, disposable).
 *
 * Runs the HEAD's `createRationaleQualityEvaluator` against the REAL task
 * outputs stored in golden for build 01a14b73
 * (execution bk-01a14b73-3b78-4ca6-b2c5-e5ce35986c37::security-alert-analysis-workflow::openai-gpt-oss-120b),
 * the two runs whose criteria cell scored 0.3333 because the judge graded an
 * artifact that contains no rationale at all.
 */

import type { DefaultEvaluators } from '@kbn/evals';
import { createRationaleQualityEvaluator } from './rationale_evaluator';

const CRITERIA = ['criterion one', 'criterion two', 'criterion three'];

/** task.output of aa-eval-tier1-malicious-file (rep 0, trace 1ca74681...), scored 0.3333 pre-PR. */
const REAL_EMPTY_TIER1 = {
  executionId: 'e2653037-9bca-42cd-9bdb-6d94af87d785',
  executionStatus: 'completed',
  classificationMethod: 'agent',
  traceId: '1ca74681648222ca17193cde59963654',
  toolCallIds: [],
  toolCallsUnavailable: true,
};

/** task.output of aa-eval-tier2-lsass (rep 0, trace 3ffeb0df...), scored 0.3333 pre-PR. */
const REAL_EMPTY_LSASS = {
  executionId: '740e6d7a-cec1-4ec7-a4cb-bcd4c0b6ad54',
  executionStatus: 'completed',
  classificationMethod: 'agent',
  traceId: '3ffeb0dfa7d57ada61daa1f3d7ae6223',
  toolCallIds: [],
  toolCallsUnavailable: true,
};

/** task.output of the same example's OTHER run in the same build, scored 0.6667. */
const REAL_NONEMPTY = {
  classification: 'true_positive',
  confidenceScore: 0.94,
  rationale: 'Gate A applied: known malicious file hash, unsigned executable, critical severity.',
  contributingFactors: ['event.code malicious_file', 'unsigned executable in user download'],
  executionId: '2ce39b34-1c72-4380-9700-795f8a0af1b6',
  executionStatus: 'completed',
  classificationMethod: 'prompt',
  traceId: '072e01bf4521393ccc71a91c25fdf359',
};

/** A verdict with a classification but no schema-required rationale. */
const CLASSIFICATION_NO_RATIONALE = {
  classification: 'true_positive',
  confidenceScore: 0.9,
  executionId: 'synthetic-1',
  executionStatus: 'completed',
};

const makeEvaluators = (score: number) => {
  const innerEvaluate = jest.fn().mockResolvedValue({ score, label: 'judged' });
  const evaluators = {
    criteria: jest.fn().mockReturnValue({ evaluate: innerEvaluate, name: 'criteria' }),
  } as unknown as DefaultEvaluators;
  return { evaluators, innerEvaluate };
};

const args = (output: unknown) =>
  ({
    input: { alertId: 'aa-eval-tier1-malicious-file' },
    output,
    expected: { classification: 'true_positive' },
    metadata: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

describe('F5 probe — real empty-verdict artifacts from build 01a14b73', () => {
  it('REAL empty verdict (tier1-malicious-file): criteria scores N/A and the judge never runs', async () => {
    const { evaluators, innerEvaluate } = makeEvaluators(0.3333);
    const result = await createRationaleQualityEvaluator(evaluators, CRITERIA).evaluate(
      args(REAL_EMPTY_TIER1)
    );
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
    expect(innerEvaluate).not.toHaveBeenCalled();
  });

  it('REAL empty verdict (tier2-lsass): criteria scores N/A and the judge never runs', async () => {
    const { evaluators, innerEvaluate } = makeEvaluators(0.3333);
    const result = await createRationaleQualityEvaluator(evaluators, CRITERIA).evaluate(
      args(REAL_EMPTY_LSASS)
    );
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
    expect(innerEvaluate).not.toHaveBeenCalled();
  });

  it('CONTROL (pre-PR path): the raw criteria judge accepts the SAME empty artifact and returns a score', async () => {
    // This is what the suite did before the wrapper: `evaluators.criteria(...)`
    // graded the empty envelope, which is why the cell scored 0.3333 instead of
    // being N/A. Proves the artifact is one the judge path does accept.
    const { evaluators, innerEvaluate } = makeEvaluators(0.3333);
    const inner = evaluators.criteria([...CRITERIA]);
    const result = await inner.evaluate(args(REAL_EMPTY_TIER1));
    expect(innerEvaluate).toHaveBeenCalledTimes(1);
    expect(result.score).toBe(0.3333);
  });

  it('classification without a rationale scores 0 / missing-rationale, not N/A', async () => {
    const { evaluators, innerEvaluate } = makeEvaluators(1);
    const result = await createRationaleQualityEvaluator(evaluators, CRITERIA).evaluate(
      args(CLASSIFICATION_NO_RATIONALE)
    );
    expect(result.score).toBe(0);
    expect(result.label).toBe('missing-rationale');
    expect(innerEvaluate).not.toHaveBeenCalled();
  });

  it('REAL non-empty verdict still reaches the judge (positive control: the fix does not short-circuit real verdicts)', async () => {
    const { evaluators, innerEvaluate } = makeEvaluators(0.6667);
    const result = await createRationaleQualityEvaluator(evaluators, CRITERIA).evaluate(
      args(REAL_NONEMPTY)
    );
    expect(result.score).toBe(0.6667);
    expect(innerEvaluate).toHaveBeenCalledTimes(1);
  });
});
