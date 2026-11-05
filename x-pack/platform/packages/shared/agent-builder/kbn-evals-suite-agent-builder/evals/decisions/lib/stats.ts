/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface Interval {
  low: number;
  high: number;
}

export interface Confusion {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface BinaryMetrics extends Confusion {
  n: number;
  accuracy: number;
  accuracyCi: Interval;
  balancedAccuracy: number;
  /** Undefined when the denominator is empty, never a fake 0 or 1. */
  recall?: number;
  specificity?: number;
  precision?: number;
}

export interface McNemarResult {
  /** A right, B wrong. */
  onlyA: number;
  /** B right, A wrong. */
  onlyB: number;
  chi2: number;
  exactP: number;
}

export interface SweepRow {
  threshold: number;
  metrics: BinaryMetrics;
}

export const assertRate = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a rate in [0, 1], got ${value}`);
  }
  return value;
};

const ratio = (numerator: number, denominator: number, name: string): number | undefined =>
  denominator === 0 ? undefined : assertRate(numerator / denominator, name);

/** Wilson score interval for k successes out of n (95% by default). */
export const wilsonInterval = (k: number, n: number, z = 1.96): Interval => {
  if (n === 0) {
    return { low: 0, high: 1 };
  }
  if (k < 0 || k > n) {
    throw new Error(`wilsonInterval: k=${k} is outside [0, n=${n}]`);
  }
  const p = k / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
};

export const confusion = (
  predictions: readonly boolean[],
  labels: readonly boolean[]
): Confusion => {
  if (predictions.length !== labels.length) {
    throw new Error(
      `confusion: ${predictions.length} predictions vs ${labels.length} labels — not the same population`
    );
  }
  const counts: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  predictions.forEach((predicted, index) => {
    const actual = labels[index];
    if (predicted && actual) counts.tp++;
    else if (predicted && !actual) counts.fp++;
    else if (!predicted && !actual) counts.tn++;
    else counts.fn++;
  });
  return counts;
};

export const binaryMetrics = (
  predictions: readonly boolean[],
  labels: readonly boolean[]
): BinaryMetrics => {
  const { tp, fp, tn, fn } = confusion(predictions, labels);
  const n = tp + fp + tn + fn;
  const correct = tp + tn;
  const recall = ratio(tp, tp + fn, 'recall');
  const specificity = ratio(tn, tn + fp, 'specificity');
  const precision = ratio(tp, tp + fp, 'precision');
  // With a single class present, balanced accuracy degrades to that class's rate.
  const classRates = [recall, specificity].filter((rate): rate is number => rate !== undefined);
  const balancedAccuracy =
    classRates.length === 0
      ? 0
      : classRates.reduce((sum, rate) => sum + rate, 0) / classRates.length;

  return {
    tp,
    fp,
    tn,
    fn,
    n,
    accuracy: n === 0 ? 0 : assertRate(correct / n, 'accuracy'),
    accuracyCi: wilsonInterval(correct, n),
    balancedAccuracy: assertRate(balancedAccuracy, 'balancedAccuracy'),
    ...(recall !== undefined ? { recall } : {}),
    ...(specificity !== undefined ? { specificity } : {}),
    ...(precision !== undefined ? { precision } : {}),
  };
};

const logChoose = (n: number, k: number): number => {
  let result = 0;
  for (let i = 1; i <= k; i++) {
    result += Math.log(n - k + i) - Math.log(i);
  }
  return result;
};

/**
 * Paired comparison of two arms over the same items. `aCorrect[i]` and `bCorrect[i]` must
 * describe the same item. Reports the continuity-corrected chi-square and the exact two-sided
 * binomial p-value, which is the one to trust when the discordant count is small.
 */
export const mcnemar = (
  aCorrect: readonly boolean[],
  bCorrect: readonly boolean[]
): McNemarResult => {
  if (aCorrect.length !== bCorrect.length) {
    throw new Error(
      `mcnemar: arms cover ${aCorrect.length} vs ${bCorrect.length} items — not the same population`
    );
  }
  let onlyA = 0;
  let onlyB = 0;
  aCorrect.forEach((a, index) => {
    const b = bCorrect[index];
    if (a && !b) onlyA++;
    if (b && !a) onlyB++;
  });
  const discordant = onlyA + onlyB;
  if (discordant === 0) {
    return { onlyA, onlyB, chi2: 0, exactP: 1 };
  }
  const chi2 = (Math.abs(onlyA - onlyB) - 1) ** 2 / discordant;
  const smaller = Math.min(onlyA, onlyB);
  let tail = 0;
  for (let k = 0; k <= smaller; k++) {
    tail += Math.exp(logChoose(discordant, k) - discordant * Math.LN2);
  }
  return { onlyA, onlyB, chi2, exactP: Math.min(1, 2 * tail) };
};

export const SWEEP_STEP = 0.05;

/** Thresholds 0.05..0.95 in 0.05 steps. Finer grids overfit a dataset this size. */
export const sweepThresholds = (): number[] => {
  const thresholds: number[] = [];
  for (let step = 1; step * SWEEP_STEP < 1 - 1e-9; step++) {
    thresholds.push(Math.round(step * SWEEP_STEP * 100) / 100);
  }
  return thresholds;
};

/** Predict positive when probability >= threshold, matching should_run_agent. */
export const thresholdSweep = (
  probabilities: readonly number[],
  labels: readonly boolean[]
): SweepRow[] => {
  probabilities.forEach((probability, index) => assertRate(probability, `probability[${index}]`));
  return sweepThresholds().map((threshold) => ({
    threshold,
    metrics: binaryMetrics(
      probabilities.map((probability) => probability >= threshold),
      labels
    ),
  }));
};

/**
 * Picks the threshold with the best balanced accuracy. Ties go to the threshold closest to
 * `prior` (the shipped default), so a flat curve does not move the threshold for no reason.
 */
export const pickThreshold = (rows: readonly SweepRow[], prior = 0.5): SweepRow => {
  if (rows.length === 0) {
    throw new Error('pickThreshold: empty sweep');
  }
  return rows.reduce((best, row) => {
    const delta = row.metrics.balancedAccuracy - best.metrics.balancedAccuracy;
    if (delta > 1e-12) return row;
    if (
      Math.abs(delta) <= 1e-12 &&
      Math.abs(row.threshold - prior) < Math.abs(best.threshold - prior)
    ) {
      return row;
    }
    return best;
  });
};

export const percentile = (values: readonly number[], p: number): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};
