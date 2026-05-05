/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elastic B.V. and/or licensed to Elastic B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * AutoDEX B3 — Production-grounded FP baseline estimator.
 *
 * Vision-doc §1.3.3 calls for grounding gate thresholds in *environment
 * baselines* — actual per-rule alert volumes and FP rates rather than
 * the global `DEFAULT_GATE_THRESHOLDS` constants. B6 already shipped
 * the per-rule override surface (`resolveGateThresholds(default, run,
 * perRule)`). What B6 cannot answer is "what numbers should go in the
 * per-rule override?". This module is the pure-logic answer.
 *
 * It accepts ONE of two snapshot shapes per rule:
 *
 *   1. `VolumeOnlySnapshot` — `.alerts-*` raw counts only. Suitable for
 *      the cold-start case where TP/FP labels haven't been collected yet.
 *      Produces a coarser baseline (alert volume only; FP-rate stays
 *      at default).
 *   2. `LabelledSnapshot` — `.soc-outcomes` rows where the analyst
 *      has confirmed `verdict ∈ {true_positive, false_positive}`.
 *      Suitable once the org has at least N labelled outcomes for the
 *      rule. Produces a full baseline (alert volume AND FP-rate
 *      grounded in real triage data).
 *
 * The helper rolls each snapshot into a `RuleFpBaselineSnapshot` envelope
 * that can be written to `.soc-rule-fp-baseline` and read back by any
 * consumer that wants to feed values into B6's per-rule gate-override
 * surface (e.g. a future `applyBaselinesToOverrides` workflow that
 * mutates `gate_overrides` per rule before each eval run).
 *
 * Verdict matrix (reflects telemetry maturity, NOT rule health — health
 * is B7's `evaluateRuleTuning`):
 *
 *   - `cold_start`     : window has fewer than `min_alerts_for_baseline`
 *                        alerts. Baseline is reported as `null` for
 *                        operator-tunable fields and the consumer
 *                        falls back to `DEFAULT_GATE_THRESHOLDS`.
 *   - `volume_only`    : we have alert counts but no labelled outcomes.
 *                        `expected_alerts_per_hour` is grounded;
 *                        `fp_rate_estimate` is `null`.
 *   - `labelled`       : both alert counts and labelled TP/FP outcomes
 *                        are present and meet the floor.
 *                        Both fields are grounded.
 *   - `insufficient_labels`: alert counts are sufficient but labelled
 *                        outcomes are below `min_labels_for_fp_rate`.
 *                        Treated like `volume_only` — `fp_rate_estimate`
 *                        falls back to `null`.
 *
 * Each baseline carries `thresholds_applied` so a downstream consumer
 * can audit which floor / quantile / smoothing the estimator used.
 */

export interface VolumeOnlySnapshot {
  readonly kind: 'volume_only';
  readonly rule_id: string;
  readonly rule_name: string;
  readonly window_hours: number;
  readonly alert_count: number;
}

export interface LabelledSnapshot {
  readonly kind: 'labelled';
  readonly rule_id: string;
  readonly rule_name: string;
  readonly window_hours: number;
  readonly alert_count: number;
  readonly true_positive_count: number;
  readonly false_positive_count: number;
}

export type RuleFpBaselineInput = VolumeOnlySnapshot | LabelledSnapshot;

export type RuleFpBaselineVerdict =
  | 'cold_start'
  | 'volume_only'
  | 'labelled'
  | 'insufficient_labels';

export interface RuleFpBaselineThresholds {
  readonly min_alerts_for_baseline: number;
  readonly min_labels_for_fp_rate: number;
  readonly volume_quantile: number;
  readonly smoothing_alpha: number;
  readonly default_fp_rate: number;
}

export const DEFAULT_FP_BASELINE_THRESHOLDS: RuleFpBaselineThresholds = {
  min_alerts_for_baseline: 50,
  min_labels_for_fp_rate: 20,
  volume_quantile: 0.95,
  smoothing_alpha: 0.1,
  default_fp_rate: 0.02,
};

export interface RuleFpBaselineSnapshot {
  readonly rule_id: string;
  readonly rule_name: string;
  readonly verdict: RuleFpBaselineVerdict;
  readonly window_hours: number;
  readonly alert_count: number;
  readonly true_positive_count: number | null;
  readonly false_positive_count: number | null;
  readonly expected_alerts_per_hour: number | null;
  readonly fp_rate_estimate: number | null;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly thresholds_applied: RuleFpBaselineThresholds;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clampUnit = (value: number): number => {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const resolveUnit = (value: unknown, fallback: number): number => {
  if (!isFiniteNumber(value)) return fallback;
  return clampUnit(value);
};

const resolvePositiveInt = (value: unknown, fallback: number, min = 1): number => {
  if (!isFiniteNumber(value)) return fallback;
  const floored = Math.floor(value);
  return floored < min ? min : floored;
};

const resolvePositiveFloat = (value: unknown, fallback: number, min = 0): number => {
  if (!isFiniteNumber(value)) return fallback;
  return value < min ? min : value;
};

export const resolveFpBaselineThresholds = (
  override?: Partial<RuleFpBaselineThresholds>
): RuleFpBaselineThresholds => {
  if (!override) return DEFAULT_FP_BASELINE_THRESHOLDS;
  return {
    min_alerts_for_baseline: resolvePositiveInt(
      override.min_alerts_for_baseline,
      DEFAULT_FP_BASELINE_THRESHOLDS.min_alerts_for_baseline
    ),
    min_labels_for_fp_rate: resolvePositiveInt(
      override.min_labels_for_fp_rate,
      DEFAULT_FP_BASELINE_THRESHOLDS.min_labels_for_fp_rate
    ),
    volume_quantile: resolveUnit(
      override.volume_quantile,
      DEFAULT_FP_BASELINE_THRESHOLDS.volume_quantile
    ),
    smoothing_alpha: resolveUnit(
      override.smoothing_alpha,
      DEFAULT_FP_BASELINE_THRESHOLDS.smoothing_alpha
    ),
    default_fp_rate: resolveUnit(
      override.default_fp_rate,
      DEFAULT_FP_BASELINE_THRESHOLDS.default_fp_rate
    ),
  };
};

const coerceCount = (value: unknown): number => {
  if (!isFiniteNumber(value)) return 0;
  if (value < 0) return 0;
  return Math.floor(value);
};

/**
 * Pure FP-rate calculation from labelled outcomes. Returns `null` if
 * the snapshot doesn't have enough labels to be meaningful.
 *
 * We use Laplace smoothing (`(fp + 1) / (fp + tp + 2)`) so a snapshot
 * with `0 fp / 0 tp` doesn't collapse to NaN, and a snapshot with
 * `5 fp / 0 tp` doesn't claim 100% FP rate (it claims `6/7 ≈ 0.857`,
 * which is honest about the uncertainty).
 */
const estimateFpRate = (
  tp: number,
  fp: number,
  thresholds: RuleFpBaselineThresholds
): number | null => {
  const labels = tp + fp;
  if (labels < thresholds.min_labels_for_fp_rate) return null;
  return (fp + 1) / (labels + 2);
};

/**
 * Confidence is a coarse `[0, 1]` heuristic: how much do we trust the
 * baseline this snapshot produced? Larger windows + more labels = more
 * trust. The shape of the curve is `1 - exp(-N/k)` where `N` is the
 * binding count (alerts for volume-only, labels for labelled) and
 * `k` is the threshold floor — i.e. confidence = 0.63 at the floor,
 * approaches 1 as N grows.
 */
const computeConfidence = (bindingCount: number, floor: number): number => {
  if (floor <= 0 || bindingCount <= 0) return 0;
  const ratio = bindingCount / floor;
  return clampUnit(1 - Math.exp(-ratio));
};

const buildColdStart = (
  raw: RuleFpBaselineInput,
  thresholds: RuleFpBaselineThresholds
): RuleFpBaselineSnapshot => ({
  rule_id: raw.rule_id,
  rule_name: raw.rule_name,
  verdict: 'cold_start',
  window_hours: resolvePositiveFloat(raw.window_hours, 0),
  alert_count: coerceCount(raw.alert_count),
  true_positive_count: raw.kind === 'labelled' ? coerceCount(raw.true_positive_count) : null,
  false_positive_count: raw.kind === 'labelled' ? coerceCount(raw.false_positive_count) : null,
  expected_alerts_per_hour: null,
  fp_rate_estimate: null,
  confidence: 0,
  reasons: [
    `alert_count=${coerceCount(raw.alert_count)} below min_alerts_for_baseline=${
      thresholds.min_alerts_for_baseline
    }`,
  ],
  thresholds_applied: thresholds,
});

export const estimateRuleFpBaseline = (
  raw: RuleFpBaselineInput,
  override?: Partial<RuleFpBaselineThresholds>
): RuleFpBaselineSnapshot => {
  const thresholds = resolveFpBaselineThresholds(override);
  const alertCount = coerceCount(raw.alert_count);
  const windowHours = resolvePositiveFloat(raw.window_hours, 0);

  if (alertCount < thresholds.min_alerts_for_baseline) {
    return buildColdStart(raw, thresholds);
  }

  if (windowHours <= 0) {
    return {
      ...buildColdStart(raw, thresholds),
      reasons: ['window_hours must be > 0 to derive a per-hour rate'],
    };
  }

  const expectedAlertsPerHour = alertCount / windowHours;

  if (raw.kind === 'volume_only') {
    return {
      rule_id: raw.rule_id,
      rule_name: raw.rule_name,
      verdict: 'volume_only',
      window_hours: windowHours,
      alert_count: alertCount,
      true_positive_count: null,
      false_positive_count: null,
      expected_alerts_per_hour: expectedAlertsPerHour,
      fp_rate_estimate: null,
      confidence: computeConfidence(alertCount, thresholds.min_alerts_for_baseline),
      reasons: [
        `volume-only baseline: ${alertCount} alert(s) over ${windowHours}h`,
        'no labelled TP/FP outcomes available; fp_rate_estimate falls back to default',
      ],
      thresholds_applied: thresholds,
    };
  }

  const tp = coerceCount(raw.true_positive_count);
  const fp = coerceCount(raw.false_positive_count);
  const fpRate = estimateFpRate(tp, fp, thresholds);

  if (fpRate === null) {
    return {
      rule_id: raw.rule_id,
      rule_name: raw.rule_name,
      verdict: 'insufficient_labels',
      window_hours: windowHours,
      alert_count: alertCount,
      true_positive_count: tp,
      false_positive_count: fp,
      expected_alerts_per_hour: expectedAlertsPerHour,
      fp_rate_estimate: null,
      confidence: computeConfidence(alertCount, thresholds.min_alerts_for_baseline),
      reasons: [
        `labelled outcomes (${tp + fp}) below min_labels_for_fp_rate=${
          thresholds.min_labels_for_fp_rate
        }`,
        'fp_rate_estimate falls back to default; alert volume is grounded',
      ],
      thresholds_applied: thresholds,
    };
  }

  return {
    rule_id: raw.rule_id,
    rule_name: raw.rule_name,
    verdict: 'labelled',
    window_hours: windowHours,
    alert_count: alertCount,
    true_positive_count: tp,
    false_positive_count: fp,
    expected_alerts_per_hour: expectedAlertsPerHour,
    fp_rate_estimate: fpRate,
    confidence: computeConfidence(tp + fp, thresholds.min_labels_for_fp_rate),
    reasons: [
      `labelled baseline: ${alertCount} alert(s) over ${windowHours}h, ${tp} TP / ${fp} FP`,
      `fp_rate Laplace-smoothed = (${fp}+1)/(${tp + fp}+2) = ${fpRate.toFixed(4)}`,
    ],
    thresholds_applied: thresholds,
  };
};
