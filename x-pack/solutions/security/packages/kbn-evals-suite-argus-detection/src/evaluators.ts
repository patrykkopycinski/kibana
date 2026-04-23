/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pure-math aggregate scoring for the ARGUS Detection Eval Vertical (M2.1).
 *
 * These functions are intentionally free of any Kibana / Elasticsearch imports
 * so they are trivial to jest-test and safe to reuse from both the Playwright
 * suite and the standalone CLI runner.
 *
 * All inputs are `number` to keep the public surface flat; the functions never
 * throw — an undefined or zero denominator collapses to `0`, and a caller
 * treats "precision of a rule that never fires" as a valid signal (not a bug).
 */

export interface AggregateCounts {
  /** Variants where `should_fire === true` and the rule fired. */
  true_positives: number;
  /** Variants where `should_fire === false` and the rule fired. */
  false_positives: number;
  /** Variants where `should_fire === true` and the rule did NOT fire. */
  false_negatives: number;
  /** Variants where `should_fire === false` and the rule did NOT fire. */
  true_negatives: number;
}

export interface AggregateScores {
  /** TP / (TP + FP). */
  precision: number;
  /** TP / (TP + FN). */
  recall: number;
  /** FP / (FP + TN). */
  fp_rate_baseline: number;
  /** Fraction of positive variant axes on which the rule produced at least one fire. */
  variant_coverage: number;
}

export type GateDecision = 'pass' | 'fail' | 'marginal';

/**
 * ARGUS governance thresholds for a promotable detection rule candidate.
 * These are intentionally conservative defaults; per-rule overrides live in
 * the detection rule's metadata (future work, not on the demo path).
 */
export const DEFAULT_GATE_THRESHOLDS = Object.freeze({
  min_precision: 0.9,
  min_recall: 0.6,
  min_variant_coverage: 0.5,
  max_fp_rate: 0.02,
  /** Distance (in any single metric) within which a rule is "marginal" vs "fail". */
  marginal_band: 0.1,
});

export type GateThresholds = typeof DEFAULT_GATE_THRESHOLDS;

export const computePrecision = (
  c: Pick<AggregateCounts, 'true_positives' | 'false_positives'>
): number => {
  const denom = c.true_positives + c.false_positives;
  return denom === 0 ? 0 : c.true_positives / denom;
};

export const computeRecall = (
  c: Pick<AggregateCounts, 'true_positives' | 'false_negatives'>
): number => {
  const denom = c.true_positives + c.false_negatives;
  return denom === 0 ? 0 : c.true_positives / denom;
};

export const computeFpRate = (
  c: Pick<AggregateCounts, 'false_positives' | 'true_negatives'>
): number => {
  const denom = c.false_positives + c.true_negatives;
  return denom === 0 ? 0 : c.false_positives / denom;
};

/**
 * Variant coverage is NOT computed from TP/FN alone — it asks, across the set
 * of distinct positive variant axes (e.g. command_args, encoding_layers,
 * process_ancestry) for this primitive, did the rule fire on at least one
 * variant per axis? This penalises rules that hit only one mutation axis even
 * if their recall looks fine.
 */
export const computeVariantCoverage = (
  positiveAxes: readonly string[],
  firedAxes: readonly string[]
): number => {
  const distinctPositive = new Set(positiveAxes);
  if (distinctPositive.size === 0) return 0;
  const distinctFired = new Set(firedAxes);
  let hits = 0;
  for (const axis of distinctPositive) {
    if (distinctFired.has(axis)) hits += 1;
  }
  return hits / distinctPositive.size;
};

export const computeScores = (
  counts: AggregateCounts,
  positiveAxes: readonly string[],
  firedAxes: readonly string[]
): AggregateScores => ({
  precision: computePrecision(counts),
  recall: computeRecall(counts),
  fp_rate_baseline: computeFpRate(counts),
  variant_coverage: computeVariantCoverage(positiveAxes, firedAxes),
});

/**
 * Classify a candidate rule against ARGUS governance thresholds.
 *
 * The decision is: `pass` if every metric clears its threshold, `fail` if any
 * metric misses by more than `marginal_band`, and `marginal` otherwise. This
 * drives the poller workflow's auto-merge / escalate / block branches.
 */
export const computeGateDecision = (
  scores: AggregateScores,
  thresholds: GateThresholds = DEFAULT_GATE_THRESHOLDS
): GateDecision => {
  const checks: Array<{ ok: boolean; miss: number }> = [
    {
      ok: scores.precision >= thresholds.min_precision,
      miss: thresholds.min_precision - scores.precision,
    },
    {
      ok: scores.recall >= thresholds.min_recall,
      miss: thresholds.min_recall - scores.recall,
    },
    {
      ok: scores.variant_coverage >= thresholds.min_variant_coverage,
      miss: thresholds.min_variant_coverage - scores.variant_coverage,
    },
    {
      ok: scores.fp_rate_baseline <= thresholds.max_fp_rate,
      miss: scores.fp_rate_baseline - thresholds.max_fp_rate,
    },
  ];

  if (checks.every((c) => c.ok)) return 'pass';
  const worstMiss = Math.max(...checks.filter((c) => !c.ok).map((c) => c.miss));
  return worstMiss <= thresholds.marginal_band ? 'marginal' : 'fail';
};
