/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import { createPrecisionRecallEvaluators } from './precision_recall_evaluators';
import type { AlertAnalysisVerdict } from './workflow_task';

interface Result {
  score: number | null;
  label: string;
  metadata?: Record<string, unknown>;
}

const byName = (name: string): Evaluator => {
  const evaluator = createPrecisionRecallEvaluators().find((e) => e.name === name);
  if (!evaluator) throw new Error(`No evaluator named ${name}`);
  return evaluator;
};

const run = (
  evaluator: Evaluator,
  predicted: string | undefined,
  expected: string
): Promise<Result> =>
  (evaluator.evaluate as (a: { output: unknown; expected: unknown }) => Promise<Result>)({
    output: { classification: predicted } as AlertAnalysisVerdict,
    expected: { classification: expected },
  });

describe('createPrecisionRecallEvaluators', () => {
  it('emits recall + precision for both decision classes only', () => {
    const names = createPrecisionRecallEvaluators()
      .map((e) => e.name)
      .sort();
    expect(names).toEqual([
      'Precision_false_positive',
      'Precision_true_positive',
      'Recall_false_positive',
      'Recall_true_positive',
    ]);
  });

  describe('Recall_true_positive', () => {
    const ev = byName('Recall_true_positive');

    it('scores 1 when a true_positive is recalled', async () => {
      const r = await run(ev, 'true_positive', 'true_positive');
      expect(r).toMatchObject({ score: 1, label: 'recalled' });
      expect(r.metadata).toMatchObject({ tp: 1, fn: 0, applicable: true });
    });

    it('scores 0 when a true_positive is missed', async () => {
      const r = await run(ev, 'false_positive', 'true_positive');
      expect(r).toMatchObject({ score: 0, label: 'missed' });
      expect(r.metadata).toMatchObject({ fn: 1, tp: 0, applicable: true });
    });

    it('returns null (not applicable) when the golden label is not true_positive', async () => {
      const r = await run(ev, 'true_positive', 'false_positive');
      expect(r.score).toBeNull();
      expect(r.metadata).toMatchObject({ applicable: false });
    });
  });

  describe('Precision_true_positive', () => {
    const ev = byName('Precision_true_positive');

    it('scores 1 when a true_positive prediction is correct', async () => {
      const r = await run(ev, 'true_positive', 'true_positive');
      expect(r).toMatchObject({ score: 1, label: 'precise' });
      expect(r.metadata).toMatchObject({ tp: 1, fp: 0, applicable: true });
    });

    it('scores 0 when a true_positive prediction is a false alarm', async () => {
      const r = await run(ev, 'true_positive', 'false_positive');
      expect(r).toMatchObject({ score: 0, label: 'false-alarm' });
      expect(r.metadata).toMatchObject({ fp: 1, tp: 0, applicable: true });
    });

    it('returns null (not applicable) when the model did not predict true_positive', async () => {
      const r = await run(ev, 'false_positive', 'true_positive');
      expect(r.score).toBeNull();
      expect(r.metadata).toMatchObject({ applicable: false });
    });
  });

  it('mean of applicable Recall_true_positive scores equals true-positive recall', async () => {
    const ev = byName('Recall_true_positive');
    // 3 golden true_positive rows, model recalls 2 of them; plus 1 false_positive row (null).
    const rows = await Promise.all([
      run(ev, 'true_positive', 'true_positive'),
      run(ev, 'true_positive', 'true_positive'),
      run(ev, 'false_positive', 'true_positive'),
      run(ev, 'false_positive', 'false_positive'),
    ]);
    const applicable = rows.map((r) => r.score).filter((s): s is number => s !== null);
    const mean = applicable.reduce((a, b) => a + b, 0) / applicable.length;
    expect(applicable).toHaveLength(3);
    expect(mean).toBeCloseTo(2 / 3);
  });
});
