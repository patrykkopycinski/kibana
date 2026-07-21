/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import { CLASSIFICATIONS, type Classification } from './constants';
import { asVerdict, asExpected } from './evaluators';

/**
 * Per-class precision and recall, encoded as per-example evaluators whose MEAN equals the
 * aggregate metric. `@kbn/evals` averages each evaluator's `score` across the dataset and
 * excludes rows that return `score: null` from that mean. We exploit that:
 *
 *   Recall(C)    = mean over rows where expected == C of (predicted == C ? 1 : 0)
 *                  -> rows where expected != C return null (not applicable to recall of C).
 *   Precision(C) = mean over rows where predicted == C of (expected == C ? 1 : 0)
 *                  -> rows where predicted != C return null (not applicable to precision of C).
 *
 * So the reported mean of `Recall_true_positive` IS the true-positive recall, etc. Each row also
 * emits its confusion cell (tp/fp/fn/tn) into metadata so the full matrix can be reconstructed.
 *
 * This validates the deck's per-model quality claims (a model that hits accuracy by calling
 * everything true_positive has high TP-recall but low TP-precision; only the pair exposes that).
 */

/** Confusion-matrix cell for a single (predicted, expected) pair relative to a target class. */
const confusionCell = (
  predicted: Classification | undefined,
  expected: Classification | undefined,
  target: Classification
) => {
  const predIsTarget = predicted === target;
  const expIsTarget = expected === target;
  return {
    tp: predIsTarget && expIsTarget ? 1 : 0,
    fp: predIsTarget && !expIsTarget ? 1 : 0,
    fn: !predIsTarget && expIsTarget ? 1 : 0,
    tn: !predIsTarget && !expIsTarget ? 1 : 0,
  };
};

/** Recall(target): score only rows whose golden label is `target`; null elsewhere. */
const createRecallEvaluator = (target: Classification): Evaluator => ({
  name: `Recall_${target}`,
  kind: 'CODE',
  evaluate: async ({ output, expected }) => {
    const predicted = asVerdict(output).classification;
    const golden = asExpected(expected)?.classification;
    const cell = confusionCell(predicted, golden, target);
    if (golden !== target) {
      return { score: null, label: 'n/a', metadata: { ...cell, applicable: false } };
    }
    const hit = predicted === target;
    return {
      score: hit ? 1 : 0,
      label: hit ? 'recalled' : 'missed',
      explanation: `expected=${target} predicted=${predicted ?? 'none'}`,
      metadata: { ...cell, applicable: true },
    };
  },
});

/** Precision(target): score only rows the model PREDICTED as `target`; null elsewhere. */
const createPrecisionEvaluator = (target: Classification): Evaluator => ({
  name: `Precision_${target}`,
  kind: 'CODE',
  evaluate: async ({ output, expected }) => {
    const predicted = asVerdict(output).classification;
    const golden = asExpected(expected)?.classification;
    const cell = confusionCell(predicted, golden, target);
    if (predicted !== target) {
      return { score: null, label: 'n/a', metadata: { ...cell, applicable: false } };
    }
    const correct = golden === target;
    return {
      score: correct ? 1 : 0,
      label: correct ? 'precise' : 'false-alarm',
      explanation: `predicted=${target} expected=${golden ?? 'none'}`,
      metadata: { ...cell, applicable: true },
    };
  },
});

/**
 * Precision + recall evaluators for the two decision classes the deck compares models on
 * (true_positive, false_positive). `inconclusive` is intentionally excluded from the target
 * set: the labeled dataset has no `inconclusive` golden rows, so a precision/recall pair for it
 * would be all-null (recall) or pure noise (precision) and clutter the report. A model emitting
 * `inconclusive` still shows up correctly as a miss/false-alarm in the tp/fp evaluators.
 */
export const PRECISION_RECALL_TARGETS: Classification[] = CLASSIFICATIONS.filter(
  (c): c is Classification => c === 'true_positive' || c === 'false_positive'
);

export const createPrecisionRecallEvaluators = (): Evaluator[] =>
  PRECISION_RECALL_TARGETS.flatMap((target) => [
    createRecallEvaluator(target),
    createPrecisionEvaluator(target),
  ]);
