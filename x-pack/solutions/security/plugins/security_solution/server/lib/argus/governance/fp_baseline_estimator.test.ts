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
  DEFAULT_FP_BASELINE_THRESHOLDS,
  estimateRuleFpBaseline,
  resolveFpBaselineThresholds,
} from './fp_baseline_estimator';
import type { LabelledSnapshot, VolumeOnlySnapshot } from './fp_baseline_estimator';

const buildVolume = (overrides: Partial<VolumeOnlySnapshot> = {}): VolumeOnlySnapshot => ({
  kind: 'volume_only',
  rule_id: 'r-1',
  rule_name: 'Volume Rule',
  window_hours: 24,
  alert_count: 100,
  ...overrides,
});

const buildLabelled = (overrides: Partial<LabelledSnapshot> = {}): LabelledSnapshot => ({
  kind: 'labelled',
  rule_id: 'r-2',
  rule_name: 'Labelled Rule',
  window_hours: 24,
  alert_count: 100,
  true_positive_count: 30,
  false_positive_count: 70,
  ...overrides,
});

describe('resolveFpBaselineThresholds', () => {
  it('returns defaults when no override is supplied', () => {
    expect(resolveFpBaselineThresholds()).toEqual(DEFAULT_FP_BASELINE_THRESHOLDS);
    expect(resolveFpBaselineThresholds(undefined)).toEqual(DEFAULT_FP_BASELINE_THRESHOLDS);
  });

  it('honours partial overrides', () => {
    const result = resolveFpBaselineThresholds({ min_alerts_for_baseline: 200 });
    expect(result.min_alerts_for_baseline).toBe(200);
    expect(result.min_labels_for_fp_rate).toBe(
      DEFAULT_FP_BASELINE_THRESHOLDS.min_labels_for_fp_rate
    );
  });

  it('floors fractional integer thresholds', () => {
    const result = resolveFpBaselineThresholds({
      min_alerts_for_baseline: 49.9,
      min_labels_for_fp_rate: 19.7,
    });
    expect(result.min_alerts_for_baseline).toBe(49);
    expect(result.min_labels_for_fp_rate).toBe(19);
  });

  it('clamps integer thresholds below 1 to 1', () => {
    expect(
      resolveFpBaselineThresholds({ min_alerts_for_baseline: 0 }).min_alerts_for_baseline
    ).toBe(1);
    expect(resolveFpBaselineThresholds({ min_labels_for_fp_rate: -3 }).min_labels_for_fp_rate).toBe(
      1
    );
  });

  it('clamps unit-bounded values into [0, 1]', () => {
    expect(resolveFpBaselineThresholds({ volume_quantile: -0.5 }).volume_quantile).toBe(0);
    expect(resolveFpBaselineThresholds({ smoothing_alpha: 1.5 }).smoothing_alpha).toBe(1);
    expect(resolveFpBaselineThresholds({ default_fp_rate: 2 }).default_fp_rate).toBe(1);
  });

  it('falls back to defaults for non-finite values', () => {
    expect(
      resolveFpBaselineThresholds({ min_alerts_for_baseline: NaN }).min_alerts_for_baseline
    ).toBe(DEFAULT_FP_BASELINE_THRESHOLDS.min_alerts_for_baseline);
    expect(resolveFpBaselineThresholds({ volume_quantile: Infinity }).volume_quantile).toBe(
      DEFAULT_FP_BASELINE_THRESHOLDS.volume_quantile
    );
  });
});

describe('estimateRuleFpBaseline', () => {
  describe('cold-start handling', () => {
    it('returns cold_start when alert_count is below min_alerts_for_baseline', () => {
      const result = estimateRuleFpBaseline(buildVolume({ alert_count: 10 }));
      expect(result.verdict).toBe('cold_start');
      expect(result.expected_alerts_per_hour).toBeNull();
      expect(result.fp_rate_estimate).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('returns cold_start for labelled snapshots below the floor', () => {
      const result = estimateRuleFpBaseline(
        buildLabelled({ alert_count: 5, true_positive_count: 1, false_positive_count: 4 })
      );
      expect(result.verdict).toBe('cold_start');
      expect(result.true_positive_count).toBe(1);
      expect(result.false_positive_count).toBe(4);
    });

    it('returns cold_start when window_hours is 0 even if alerts meet floor', () => {
      const result = estimateRuleFpBaseline(buildVolume({ window_hours: 0, alert_count: 100 }));
      expect(result.verdict).toBe('cold_start');
      expect(result.expected_alerts_per_hour).toBeNull();
    });

    it('coerces negative or NaN counts defensively', () => {
      const result = estimateRuleFpBaseline(buildVolume({ alert_count: -10 as unknown as number }));
      expect(result.alert_count).toBe(0);
      expect(result.verdict).toBe('cold_start');
    });
  });

  describe('volume_only path', () => {
    it('reports expected_alerts_per_hour for sufficient alerts', () => {
      const result = estimateRuleFpBaseline(buildVolume({ alert_count: 240, window_hours: 24 }));
      expect(result.verdict).toBe('volume_only');
      expect(result.expected_alerts_per_hour).toBe(10);
      expect(result.fp_rate_estimate).toBeNull();
    });

    it('confidence rises with more alerts above the floor', () => {
      const lo = estimateRuleFpBaseline(buildVolume({ alert_count: 50 }));
      const hi = estimateRuleFpBaseline(buildVolume({ alert_count: 500 }));
      expect(hi.confidence).toBeGreaterThan(lo.confidence);
      expect(hi.confidence).toBeLessThanOrEqual(1);
    });

    it('preserves rule identity', () => {
      const result = estimateRuleFpBaseline(buildVolume({ rule_id: 'r-99', rule_name: 'Custom' }));
      expect(result.rule_id).toBe('r-99');
      expect(result.rule_name).toBe('Custom');
    });
  });

  describe('labelled path', () => {
    it('returns labelled when both alert + label floors are met', () => {
      const result = estimateRuleFpBaseline(buildLabelled());
      expect(result.verdict).toBe('labelled');
      expect(result.fp_rate_estimate).not.toBeNull();
      expect(result.true_positive_count).toBe(30);
      expect(result.false_positive_count).toBe(70);
    });

    it('Laplace-smooths the FP rate (no division-by-zero)', () => {
      const result = estimateRuleFpBaseline(
        buildLabelled({ true_positive_count: 0, false_positive_count: 100 })
      );
      expect(result.fp_rate_estimate).toBeCloseTo(101 / 102, 6);
    });

    it('Laplace-smooths the FP rate (zero FPs)', () => {
      const result = estimateRuleFpBaseline(
        buildLabelled({ true_positive_count: 100, false_positive_count: 0 })
      );
      expect(result.fp_rate_estimate).toBeCloseTo(1 / 102, 6);
    });

    it('returns insufficient_labels when alerts are sufficient but labels are not', () => {
      const result = estimateRuleFpBaseline(
        buildLabelled({
          alert_count: 100,
          true_positive_count: 5,
          false_positive_count: 5,
        })
      );
      expect(result.verdict).toBe('insufficient_labels');
      expect(result.expected_alerts_per_hour).not.toBeNull();
      expect(result.fp_rate_estimate).toBeNull();
    });

    it('respects per-call min_labels_for_fp_rate override', () => {
      const result = estimateRuleFpBaseline(
        buildLabelled({
          alert_count: 100,
          true_positive_count: 5,
          false_positive_count: 5,
        }),
        { min_labels_for_fp_rate: 10 }
      );
      expect(result.verdict).toBe('labelled');
      expect(result.fp_rate_estimate).not.toBeNull();
    });

    it('confidence at the label floor is ~0.63 (1 - 1/e)', () => {
      const result = estimateRuleFpBaseline(
        buildLabelled({
          alert_count: 100,
          true_positive_count: 10,
          false_positive_count: 10,
        })
      );
      expect(result.confidence).toBeCloseTo(1 - Math.exp(-1), 2);
    });

    it('coerces malformed labelled counts defensively', () => {
      const result = estimateRuleFpBaseline(
        buildLabelled({
          alert_count: 100,
          true_positive_count: -5 as unknown as number,
          false_positive_count: NaN as unknown as number,
        })
      );
      expect(result.true_positive_count).toBe(0);
      expect(result.false_positive_count).toBe(0);
      expect(result.verdict).toBe('insufficient_labels');
    });

    it('captures all applied thresholds for audit', () => {
      const result = estimateRuleFpBaseline(buildLabelled(), {
        min_alerts_for_baseline: 10,
        default_fp_rate: 0.1,
      });
      expect(result.thresholds_applied.min_alerts_for_baseline).toBe(10);
      expect(result.thresholds_applied.default_fp_rate).toBe(0.1);
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const snap = buildLabelled();
      const a = estimateRuleFpBaseline(snap);
      const b = estimateRuleFpBaseline(snap);
      expect(a).toEqual(b);
    });
  });
});
