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
 * AutoDEX B7 — Rule Tuning chat skill (epic 17091) — pure-logic core.
 *
 * The chat-driven tuning workflow has two halves: (a) the recommendation
 * engine that turns "this rule's recent telemetry" into a structured
 * tuning verdict, and (b) the chat-skill plumbing that exposes the verdict
 * to the user via the agent-builder runtime.
 *
 * This module ships (a). It is intentionally a pure function that takes
 * `RuleTelemetrySnapshot` in and returns `RuleTuningRecommendation` out
 * — no ES client, no agent-builder dependencies. The chat-skill plumbing
 * (which depends on the 17090.1 / 17090.4 prerequisite tools enumerated
 * in `epic-17090-audit.md`) wraps this helper and surfaces the verdict
 * conversationally.
 *
 * Verdict matrix:
 *
 *   insufficient_data : alerts_24h < min_alerts_for_verdict
 *   disable           : fp_rate >= disable_fp_rate
 *                       AND tp_count < min_tps_for_keep
 *   tune_threshold    : alerts_per_hour > baseline_alerts_per_hour
 *                                          * tune_threshold_multiplier
 *   add_exception     : fp_rate >= noise_fp_rate
 *                       AND any cluster's share of FPs >= add_exception_cluster_share
 *   narrow_query      : fp_rate >= noise_fp_rate
 *                       AND no cluster crosses add_exception_cluster_share
 *   healthy           : everything else
 *
 * Each verdict carries one or more closed-set actions:
 *
 *   log_only        | review_metrics  | open_review_case
 *   propose_tune_threshold | propose_add_exception | propose_disable
 *   propose_narrow_query
 */

export interface RuleTelemetrySnapshot {
  readonly rule_id: string;
  readonly rule_name: string;
  readonly window_hours: number;
  readonly alerts_24h: number;
  readonly true_positive_count: number;
  readonly false_positive_count: number;
  readonly inconclusive_count: number;
  readonly baseline_alerts_per_hour: number;
  readonly current_severity?: string;
  readonly current_threshold?: number;
  readonly fp_clusters?: readonly RuleFalsePositiveCluster[];
  readonly last_modified_ts?: string;
}

export interface RuleFalsePositiveCluster {
  readonly field: string;
  readonly value: string;
  readonly count: number;
}

export type RuleTuningVerdict =
  | 'insufficient_data'
  | 'healthy'
  | 'tune_threshold'
  | 'add_exception'
  | 'narrow_query'
  | 'disable';

export type RuleTuningAction =
  | 'log_only'
  | 'review_metrics'
  | 'open_review_case'
  | 'propose_tune_threshold'
  | 'propose_add_exception'
  | 'propose_narrow_query'
  | 'propose_disable';

export interface RuleTuningThresholds {
  readonly min_alerts_for_verdict: number;
  readonly disable_fp_rate: number;
  readonly disable_min_tps: number;
  readonly tune_threshold_multiplier: number;
  readonly noise_fp_rate: number;
  readonly add_exception_cluster_share: number;
}

export const DEFAULT_RULE_TUNING_THRESHOLDS: RuleTuningThresholds = {
  min_alerts_for_verdict: 5,
  disable_fp_rate: 0.95,
  disable_min_tps: 1,
  tune_threshold_multiplier: 3,
  noise_fp_rate: 0.7,
  add_exception_cluster_share: 0.3,
};

export interface RuleTuningProposalAddException {
  readonly type: 'add_exception';
  readonly field: string;
  readonly value: string;
  readonly fp_count: number;
  readonly fp_share: number;
}

export interface RuleTuningProposalTuneThreshold {
  readonly type: 'tune_threshold';
  readonly current_threshold: number | null;
  readonly suggested_threshold: number;
  readonly observed_alerts_per_hour: number;
  readonly baseline_alerts_per_hour: number;
}

export interface RuleTuningProposalDisable {
  readonly type: 'disable';
  readonly fp_rate: number;
  readonly tp_count: number;
}

export interface RuleTuningProposalNarrowQuery {
  readonly type: 'narrow_query';
  readonly fp_rate: number;
  readonly hint: string;
}

export type RuleTuningProposal =
  | RuleTuningProposalAddException
  | RuleTuningProposalTuneThreshold
  | RuleTuningProposalDisable
  | RuleTuningProposalNarrowQuery;

export interface RuleTuningRecommendation {
  readonly rule_id: string;
  readonly rule_name: string;
  readonly verdict: RuleTuningVerdict;
  readonly reasons: readonly string[];
  readonly recommended_actions: readonly RuleTuningAction[];
  readonly proposals: readonly RuleTuningProposal[];
  readonly metrics_snapshot: RuleTelemetrySnapshot;
  readonly thresholds_applied: RuleTuningThresholds;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clampUnit = (value: number): number => {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const resolveUnit = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) ? clampUnit(value) : fallback;

const resolvePositiveInt = (value: unknown, fallback: number, min = 1): number => {
  if (!isFiniteNumber(value)) return fallback;
  const floored = Math.floor(value);
  return floored < min ? min : floored;
};

const resolvePositiveNumber = (value: unknown, fallback: number, min = 0): number => {
  if (!isFiniteNumber(value)) return fallback;
  return value < min ? min : value;
};

export const resolveRuleTuningThresholds = (
  override?: Partial<RuleTuningThresholds>
): RuleTuningThresholds => {
  if (!override) return DEFAULT_RULE_TUNING_THRESHOLDS;
  const minAlerts = resolvePositiveInt(
    override.min_alerts_for_verdict,
    DEFAULT_RULE_TUNING_THRESHOLDS.min_alerts_for_verdict
  );
  const disableFp = resolveUnit(
    override.disable_fp_rate,
    DEFAULT_RULE_TUNING_THRESHOLDS.disable_fp_rate
  );
  const disableMinTps = resolvePositiveInt(
    override.disable_min_tps,
    DEFAULT_RULE_TUNING_THRESHOLDS.disable_min_tps,
    0
  );
  const tuneMultiplier = resolvePositiveNumber(
    override.tune_threshold_multiplier,
    DEFAULT_RULE_TUNING_THRESHOLDS.tune_threshold_multiplier,
    1
  );
  const noiseFp = resolveUnit(override.noise_fp_rate, DEFAULT_RULE_TUNING_THRESHOLDS.noise_fp_rate);
  const clusterShare = resolveUnit(
    override.add_exception_cluster_share,
    DEFAULT_RULE_TUNING_THRESHOLDS.add_exception_cluster_share
  );
  return {
    min_alerts_for_verdict: minAlerts,
    disable_fp_rate: Math.max(disableFp, noiseFp),
    disable_min_tps: disableMinTps,
    tune_threshold_multiplier: Math.max(tuneMultiplier, 1),
    noise_fp_rate: noiseFp,
    add_exception_cluster_share: clusterShare,
  };
};

const safeCount = (value: unknown): number => {
  if (!isFiniteNumber(value)) return 0;
  if (value < 0) return 0;
  return Math.floor(value);
};

const safeRate = (numerator: number, denominator: number): number => {
  if (denominator <= 0) return 0;
  return clampUnit(numerator / denominator);
};

const ratePerHour = (count: number, windowHours: number): number => {
  if (windowHours <= 0) return 0;
  return count / windowHours;
};

const findDominantCluster = (
  clusters: readonly RuleFalsePositiveCluster[],
  totalFps: number,
  threshold: number
): RuleFalsePositiveCluster | null => {
  if (totalFps <= 0 || clusters.length === 0) return null;
  let best: RuleFalsePositiveCluster | null = null;
  let bestShare = 0;
  for (const cluster of clusters) {
    const count = safeCount(cluster.count);
    const share = safeRate(count, totalFps);
    if (share >= threshold && share > bestShare) {
      best = { ...cluster, count };
      bestShare = share;
    }
  }
  return best;
};

const normaliseSnapshot = (snapshot: RuleTelemetrySnapshot): RuleTelemetrySnapshot => ({
  ...snapshot,
  window_hours: resolvePositiveNumber(snapshot.window_hours, 24, 0.0001),
  alerts_24h: safeCount(snapshot.alerts_24h),
  true_positive_count: safeCount(snapshot.true_positive_count),
  false_positive_count: safeCount(snapshot.false_positive_count),
  inconclusive_count: safeCount(snapshot.inconclusive_count),
  baseline_alerts_per_hour: resolvePositiveNumber(snapshot.baseline_alerts_per_hour, 0, 0),
  fp_clusters: Array.isArray(snapshot.fp_clusters) ? snapshot.fp_clusters : [],
});

export const evaluateRuleTuning = (
  rawSnapshot: RuleTelemetrySnapshot,
  thresholdsOverride?: Partial<RuleTuningThresholds>
): RuleTuningRecommendation => {
  const thresholds = resolveRuleTuningThresholds(thresholdsOverride);
  const snapshot = normaliseSnapshot(rawSnapshot);
  const totalDispositions =
    snapshot.true_positive_count + snapshot.false_positive_count + snapshot.inconclusive_count;

  if (snapshot.alerts_24h < thresholds.min_alerts_for_verdict) {
    return {
      rule_id: snapshot.rule_id,
      rule_name: snapshot.rule_name,
      verdict: 'insufficient_data',
      reasons: [
        `alerts_24h=${snapshot.alerts_24h} below min_alerts_for_verdict=${thresholds.min_alerts_for_verdict}`,
      ],
      recommended_actions: ['log_only'],
      proposals: [],
      metrics_snapshot: snapshot,
      thresholds_applied: thresholds,
    };
  }

  const fpRate = safeRate(snapshot.false_positive_count, totalDispositions);
  const observedPerHour = ratePerHour(snapshot.alerts_24h, snapshot.window_hours);
  const baselinePerHour = snapshot.baseline_alerts_per_hour;

  if (
    fpRate >= thresholds.disable_fp_rate &&
    snapshot.true_positive_count < thresholds.disable_min_tps
  ) {
    const proposal: RuleTuningProposalDisable = {
      type: 'disable',
      fp_rate: fpRate,
      tp_count: snapshot.true_positive_count,
    };
    return {
      rule_id: snapshot.rule_id,
      rule_name: snapshot.rule_name,
      verdict: 'disable',
      reasons: [
        `false_positive rate=${fpRate.toFixed(2)} >= disable_fp_rate=${thresholds.disable_fp_rate}`,
        `true_positives=${snapshot.true_positive_count} < disable_min_tps=${thresholds.disable_min_tps}`,
      ],
      recommended_actions: ['propose_disable', 'open_review_case'],
      proposals: [proposal],
      metrics_snapshot: snapshot,
      thresholds_applied: thresholds,
    };
  }

  if (
    baselinePerHour > 0 &&
    observedPerHour >= baselinePerHour * thresholds.tune_threshold_multiplier
  ) {
    const suggestedThreshold = Math.max(1, Math.ceil(baselinePerHour * 1.5));
    const proposal: RuleTuningProposalTuneThreshold = {
      type: 'tune_threshold',
      current_threshold:
        typeof snapshot.current_threshold === 'number' ? snapshot.current_threshold : null,
      suggested_threshold: suggestedThreshold,
      observed_alerts_per_hour: observedPerHour,
      baseline_alerts_per_hour: baselinePerHour,
    };
    return {
      rule_id: snapshot.rule_id,
      rule_name: snapshot.rule_name,
      verdict: 'tune_threshold',
      reasons: [
        `observed_alerts_per_hour=${observedPerHour.toFixed(
          2
        )} >= baseline ${baselinePerHour.toFixed(2)} * multiplier ${
          thresholds.tune_threshold_multiplier
        }`,
      ],
      recommended_actions: ['propose_tune_threshold', 'review_metrics'],
      proposals: [proposal],
      metrics_snapshot: snapshot,
      thresholds_applied: thresholds,
    };
  }

  if (fpRate >= thresholds.noise_fp_rate) {
    const dominantCluster = findDominantCluster(
      snapshot.fp_clusters ?? [],
      snapshot.false_positive_count,
      thresholds.add_exception_cluster_share
    );
    if (dominantCluster) {
      const share = safeRate(dominantCluster.count, snapshot.false_positive_count);
      const proposal: RuleTuningProposalAddException = {
        type: 'add_exception',
        field: dominantCluster.field,
        value: dominantCluster.value,
        fp_count: dominantCluster.count,
        fp_share: share,
      };
      return {
        rule_id: snapshot.rule_id,
        rule_name: snapshot.rule_name,
        verdict: 'add_exception',
        reasons: [
          `false_positive rate=${fpRate.toFixed(2)} >= noise_fp_rate=${thresholds.noise_fp_rate}`,
          `dominant fp cluster ${dominantCluster.field}=${dominantCluster.value} accounts for ${(
            share * 100
          ).toFixed(1)}% of false positives`,
        ],
        recommended_actions: ['propose_add_exception', 'review_metrics'],
        proposals: [proposal],
        metrics_snapshot: snapshot,
        thresholds_applied: thresholds,
      };
    }
    const proposal: RuleTuningProposalNarrowQuery = {
      type: 'narrow_query',
      fp_rate: fpRate,
      hint: 'No single FP cluster crossed add_exception_cluster_share — query specificity is the likely root cause.',
    };
    return {
      rule_id: snapshot.rule_id,
      rule_name: snapshot.rule_name,
      verdict: 'narrow_query',
      reasons: [
        `false_positive rate=${fpRate.toFixed(2)} >= noise_fp_rate=${thresholds.noise_fp_rate}`,
        `no fp cluster reached add_exception_cluster_share=${thresholds.add_exception_cluster_share}`,
      ],
      recommended_actions: ['propose_narrow_query', 'open_review_case'],
      proposals: [proposal],
      metrics_snapshot: snapshot,
      thresholds_applied: thresholds,
    };
  }

  return {
    rule_id: snapshot.rule_id,
    rule_name: snapshot.rule_name,
    verdict: 'healthy',
    reasons: [
      `false_positive rate=${fpRate.toFixed(2)} below noise_fp_rate=${thresholds.noise_fp_rate}`,
      `alerts_per_hour=${observedPerHour.toFixed(2)} within baseline tolerance`,
    ],
    recommended_actions: ['log_only'],
    proposals: [],
    metrics_snapshot: snapshot,
    thresholds_applied: thresholds,
  };
};
