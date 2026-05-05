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

import {
  DEFAULT_RULE_TUNING_THRESHOLDS,
  evaluateRuleTuning,
  resolveRuleTuningThresholds,
} from './rule_tuning_advisor';
import type { RuleTelemetrySnapshot } from './rule_tuning_advisor';

const buildSnapshot = (overrides: Partial<RuleTelemetrySnapshot> = {}): RuleTelemetrySnapshot => ({
  rule_id: 'rule-powershell-encoded',
  rule_name: 'PowerShell encoded command line',
  window_hours: 24,
  alerts_24h: 100,
  true_positive_count: 80,
  false_positive_count: 15,
  inconclusive_count: 5,
  baseline_alerts_per_hour: 4,
  ...overrides,
});

describe('resolveRuleTuningThresholds', () => {
  it('returns defaults when no override is supplied', () => {
    expect(resolveRuleTuningThresholds()).toEqual(DEFAULT_RULE_TUNING_THRESHOLDS);
    expect(resolveRuleTuningThresholds(undefined)).toEqual(DEFAULT_RULE_TUNING_THRESHOLDS);
  });

  it('honours partial overrides', () => {
    const result = resolveRuleTuningThresholds({
      min_alerts_for_verdict: 25,
      noise_fp_rate: 0.5,
    });
    expect(result.min_alerts_for_verdict).toBe(25);
    expect(result.noise_fp_rate).toBe(0.5);
    expect(result.disable_fp_rate).toBe(DEFAULT_RULE_TUNING_THRESHOLDS.disable_fp_rate);
  });

  it('clamps unit-bounded values into [0, 1]', () => {
    const result = resolveRuleTuningThresholds({
      disable_fp_rate: 5,
      noise_fp_rate: -0.5,
      add_exception_cluster_share: 1.5,
    });
    expect(result.disable_fp_rate).toBe(1);
    expect(result.noise_fp_rate).toBe(0);
    expect(result.add_exception_cluster_share).toBe(1);
  });

  it('keeps disable_fp_rate above noise_fp_rate when override would invert them', () => {
    const result = resolveRuleTuningThresholds({
      disable_fp_rate: 0.4,
      noise_fp_rate: 0.6,
    });
    expect(result.noise_fp_rate).toBe(0.6);
    expect(result.disable_fp_rate).toBe(0.6);
  });

  it('clamps tune_threshold_multiplier to >= 1', () => {
    const result = resolveRuleTuningThresholds({
      tune_threshold_multiplier: 0.2,
    });
    expect(result.tune_threshold_multiplier).toBe(1);
  });

  it('floors fractional integer overrides', () => {
    expect(
      resolveRuleTuningThresholds({ min_alerts_for_verdict: 4.7 }).min_alerts_for_verdict
    ).toBe(4);
  });

  it('falls back to defaults for non-finite values', () => {
    const result = resolveRuleTuningThresholds({
      min_alerts_for_verdict: NaN,
      tune_threshold_multiplier: Number.POSITIVE_INFINITY,
    });
    expect(result.min_alerts_for_verdict).toBe(
      DEFAULT_RULE_TUNING_THRESHOLDS.min_alerts_for_verdict
    );
    expect(result.tune_threshold_multiplier).toBe(
      DEFAULT_RULE_TUNING_THRESHOLDS.tune_threshold_multiplier
    );
  });

  it('floors min_alerts_for_verdict below 1', () => {
    expect(resolveRuleTuningThresholds({ min_alerts_for_verdict: 0 }).min_alerts_for_verdict).toBe(
      1
    );
    expect(resolveRuleTuningThresholds({ min_alerts_for_verdict: -3 }).min_alerts_for_verdict).toBe(
      1
    );
  });

  it('accepts disable_min_tps=0 (auto-disable allowed)', () => {
    expect(resolveRuleTuningThresholds({ disable_min_tps: 0 }).disable_min_tps).toBe(0);
  });
});

describe('evaluateRuleTuning', () => {
  it('returns insufficient_data when alerts_24h is below threshold', () => {
    const result = evaluateRuleTuning(buildSnapshot({ alerts_24h: 2 }));
    expect(result.verdict).toBe('insufficient_data');
    expect(result.recommended_actions).toEqual(['log_only']);
    expect(result.proposals).toHaveLength(0);
  });

  it('returns healthy when fp_rate is low and volume is within baseline', () => {
    const result = evaluateRuleTuning(buildSnapshot());
    expect(result.verdict).toBe('healthy');
    expect(result.recommended_actions).toEqual(['log_only']);
    expect(result.proposals).toHaveLength(0);
  });

  it('returns disable when fp_rate is overwhelming and tp count is below threshold', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 0,
        false_positive_count: 96,
        inconclusive_count: 4,
      })
    );
    expect(result.verdict).toBe('disable');
    expect(result.recommended_actions).toEqual(['propose_disable', 'open_review_case']);
    expect(result.proposals[0]).toMatchObject({ type: 'disable', tp_count: 0 });
  });

  it('does NOT disable when there is at least one true positive (default disable_min_tps=1)', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 1,
        false_positive_count: 95,
        inconclusive_count: 4,
        fp_clusters: [{ field: 'host.name', value: 'jenkins-runner', count: 60 }],
      })
    );
    expect(result.verdict).toBe('add_exception');
  });

  it('returns tune_threshold when alerts_per_hour exceeds baseline by multiplier', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 600,
        baseline_alerts_per_hour: 5,
        true_positive_count: 400,
        false_positive_count: 150,
        inconclusive_count: 50,
        current_threshold: 3,
      })
    );
    expect(result.verdict).toBe('tune_threshold');
    expect(result.proposals[0]).toMatchObject({
      type: 'tune_threshold',
      current_threshold: 3,
      observed_alerts_per_hour: 25,
      baseline_alerts_per_hour: 5,
    });
    expect(result.recommended_actions).toEqual(['propose_tune_threshold', 'review_metrics']);
  });

  it('does NOT tune_threshold when baseline_alerts_per_hour is 0 (cold start)', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 600,
        baseline_alerts_per_hour: 0,
        true_positive_count: 590,
        false_positive_count: 5,
        inconclusive_count: 5,
      })
    );
    expect(result.verdict).toBe('healthy');
  });

  it('returns add_exception when a single cluster dominates the FP set', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 20,
        false_positive_count: 75,
        inconclusive_count: 5,
        fp_clusters: [
          { field: 'host.name', value: 'jenkins-runner', count: 50 },
          { field: 'host.name', value: 'admin-laptop', count: 10 },
        ],
      })
    );
    expect(result.verdict).toBe('add_exception');
    expect(result.proposals[0]).toMatchObject({
      type: 'add_exception',
      field: 'host.name',
      value: 'jenkins-runner',
      fp_count: 50,
    });
    expect((result.proposals[0] as { fp_share: number }).fp_share).toBeCloseTo(50 / 75, 5);
  });

  it('returns narrow_query when fp_rate is high but no cluster dominates', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 20,
        false_positive_count: 75,
        inconclusive_count: 5,
        fp_clusters: [
          { field: 'host.name', value: 'host-a', count: 5 },
          { field: 'host.name', value: 'host-b', count: 4 },
          { field: 'host.name', value: 'host-c', count: 3 },
        ],
      })
    );
    expect(result.verdict).toBe('narrow_query');
    expect(result.recommended_actions).toEqual(['propose_narrow_query', 'open_review_case']);
  });

  it('returns narrow_query when fp_clusters are absent entirely', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 20,
        false_positive_count: 75,
        inconclusive_count: 5,
      })
    );
    expect(result.verdict).toBe('narrow_query');
  });

  it('selects the largest cluster when multiple cross add_exception_cluster_share', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 10,
        false_positive_count: 80,
        inconclusive_count: 10,
        fp_clusters: [
          { field: 'host.name', value: 'first', count: 30 },
          { field: 'host.name', value: 'second', count: 35 },
        ],
      })
    );
    expect(result.verdict).toBe('add_exception');
    expect(result.proposals[0]).toMatchObject({
      field: 'host.name',
      value: 'second',
      fp_count: 35,
    });
  });

  it('honours per-call threshold overrides', () => {
    const result = evaluateRuleTuning(buildSnapshot({ alerts_24h: 4 }), {
      min_alerts_for_verdict: 3,
    });
    expect(result.verdict).toBe('healthy');
    expect(result.thresholds_applied.min_alerts_for_verdict).toBe(3);
  });

  it('coerces negative / non-finite counts to 0 defensively', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 50,
        true_positive_count: Number.NaN as unknown as number,
        false_positive_count: -10 as unknown as number,
        inconclusive_count: 0,
      })
    );
    expect(result.metrics_snapshot.true_positive_count).toBe(0);
    expect(result.metrics_snapshot.false_positive_count).toBe(0);
    expect(result.verdict).toBe('healthy');
  });

  it('emits a deterministic recommendation for the same input', () => {
    const snapshot = buildSnapshot({
      alerts_24h: 100,
      true_positive_count: 10,
      false_positive_count: 80,
      inconclusive_count: 10,
      fp_clusters: [
        { field: 'host.name', value: 'first', count: 30 },
        { field: 'host.name', value: 'second', count: 35 },
      ],
    });
    const a = evaluateRuleTuning(snapshot);
    const b = evaluateRuleTuning(snapshot);
    expect(a).toEqual(b);
  });

  it('preserves rule_id and rule_name on the recommendation envelope', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({ rule_id: 'r-42', rule_name: 'Rule Forty Two' })
    );
    expect(result.rule_id).toBe('r-42');
    expect(result.rule_name).toBe('Rule Forty Two');
  });

  it('captures all stamped thresholds in the recommendation for audit replay', () => {
    const result = evaluateRuleTuning(buildSnapshot(), { min_alerts_for_verdict: 3 });
    expect(result.thresholds_applied.min_alerts_for_verdict).toBe(3);
    expect(result.thresholds_applied.disable_fp_rate).toBe(
      DEFAULT_RULE_TUNING_THRESHOLDS.disable_fp_rate
    );
  });

  it('treats a fractional floor share threshold correctly (cluster ≥ threshold qualifies)', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 20,
        false_positive_count: 75,
        inconclusive_count: 5,
        fp_clusters: [{ field: 'host.name', value: 'jenkins', count: 23 }], // 23/75 ≈ 0.307
      }),
      { add_exception_cluster_share: 0.3 }
    );
    expect(result.verdict).toBe('add_exception');
  });

  it('falls through to narrow_query if cluster strictly below the threshold', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        alerts_24h: 100,
        true_positive_count: 20,
        false_positive_count: 75,
        inconclusive_count: 5,
        fp_clusters: [{ field: 'host.name', value: 'jenkins', count: 15 }], // 15/75 = 0.2
      }),
      { add_exception_cluster_share: 0.3 }
    );
    expect(result.verdict).toBe('narrow_query');
  });

  it('treats window_hours=0 defensively (does not divide by zero)', () => {
    const result = evaluateRuleTuning(
      buildSnapshot({
        window_hours: 0 as unknown as number,
        alerts_24h: 50,
        baseline_alerts_per_hour: 1,
      })
    );
    expect(result.metrics_snapshot.window_hours).toBeGreaterThan(0);
    expect(result.verdict).not.toBe('insufficient_data');
  });
});
