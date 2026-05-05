/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  computePrecision,
  computeRecall,
  computeFpRate,
  computeVariantCoverage,
  computeScores,
  computeGateDecision,
  DEFAULT_GATE_THRESHOLDS,
  resolveGateThresholds,
} from './evaluators';

describe('ARGUS detection evaluators — pure math', () => {
  describe('computePrecision', () => {
    it('returns TP / (TP + FP)', () => {
      expect(computePrecision({ true_positives: 9, false_positives: 1 })).toBeCloseTo(0.9);
    });
    it('returns 0 when the rule never fired', () => {
      expect(computePrecision({ true_positives: 0, false_positives: 0 })).toBe(0);
    });
    it('returns 1 for a rule with only true positives', () => {
      expect(computePrecision({ true_positives: 5, false_positives: 0 })).toBe(1);
    });
  });

  describe('computeRecall', () => {
    it('returns TP / (TP + FN)', () => {
      expect(computeRecall({ true_positives: 6, false_negatives: 4 })).toBeCloseTo(0.6);
    });
    it('returns 0 when there are no positive variants at all', () => {
      expect(computeRecall({ true_positives: 0, false_negatives: 0 })).toBe(0);
    });
  });

  describe('computeFpRate', () => {
    it('returns FP / (FP + TN)', () => {
      expect(computeFpRate({ false_positives: 1, true_negatives: 99 })).toBeCloseTo(0.01);
    });
    it('returns 0 when the negative baseline is empty', () => {
      expect(computeFpRate({ false_positives: 0, true_negatives: 0 })).toBe(0);
    });
  });

  describe('computeVariantCoverage', () => {
    it('counts the fraction of distinct axes the rule touched', () => {
      expect(
        computeVariantCoverage(
          ['command_args', 'encoding_layers', 'process_ancestry'],
          ['command_args', 'encoding_layers']
        )
      ).toBeCloseTo(2 / 3);
    });
    it('returns 0 when there are no positive axes', () => {
      expect(computeVariantCoverage([], [])).toBe(0);
    });
    it('ignores fired axes that are not part of the positive set', () => {
      expect(computeVariantCoverage(['command_args'], ['command_args', 'process_ancestry'])).toBe(
        1
      );
    });
    it('deduplicates axes before dividing', () => {
      expect(
        computeVariantCoverage(
          ['command_args', 'command_args', 'encoding_layers'],
          ['command_args']
        )
      ).toBeCloseTo(1 / 2);
    });
  });

  describe('computeScores', () => {
    it('combines all four metrics into a single bundle', () => {
      const scores = computeScores(
        { true_positives: 8, false_positives: 1, false_negatives: 2, true_negatives: 40 },
        ['command_args', 'encoding_layers', 'process_ancestry'],
        ['command_args', 'encoding_layers']
      );
      expect(scores.precision).toBeCloseTo(8 / 9);
      expect(scores.recall).toBeCloseTo(0.8);
      expect(scores.fp_rate_baseline).toBeCloseTo(1 / 41);
      expect(scores.variant_coverage).toBeCloseTo(2 / 3);
    });
  });

  describe('computeGateDecision', () => {
    it('returns pass when every threshold clears', () => {
      expect(
        computeGateDecision({
          precision: 0.95,
          recall: 0.7,
          fp_rate_baseline: 0.01,
          variant_coverage: 0.7,
        })
      ).toBe('pass');
    });
    it('returns marginal when a metric misses by at most the marginal band', () => {
      const thresholds = DEFAULT_GATE_THRESHOLDS;
      expect(
        computeGateDecision({
          precision: thresholds.min_precision - 0.05,
          recall: thresholds.min_recall,
          fp_rate_baseline: 0,
          variant_coverage: thresholds.min_variant_coverage,
        })
      ).toBe('marginal');
    });
    it('returns fail when a metric misses by more than the marginal band', () => {
      expect(
        computeGateDecision({
          precision: 0.5,
          recall: 0.3,
          fp_rate_baseline: 0.5,
          variant_coverage: 0.1,
        })
      ).toBe('fail');
    });
    it('fails on an excessive false-positive rate alone', () => {
      expect(
        computeGateDecision({
          precision: 0.95,
          recall: 0.8,
          fp_rate_baseline: 0.2,
          variant_coverage: 0.8,
        })
      ).toBe('fail');
    });
  });

  describe('resolveGateThresholds (B6 — closes F-003)', () => {
    it('returns the unmodified defaults when neither override is present', () => {
      const { thresholds, origin } = resolveGateThresholds();
      expect(thresholds).toEqual(DEFAULT_GATE_THRESHOLDS);
      expect(origin).toBe('default');
    });

    it('applies a run-level override and reports run_level origin', () => {
      const { thresholds, origin } = resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, {
        min_precision: 0.7,
      });
      expect(thresholds.min_precision).toBe(0.7);
      // unchanged keys fall through to defaults
      expect(thresholds.min_recall).toBe(DEFAULT_GATE_THRESHOLDS.min_recall);
      expect(thresholds.max_fp_rate).toBe(DEFAULT_GATE_THRESHOLDS.max_fp_rate);
      expect(origin).toBe('run_level');
    });

    it('applies a per-rule override and reports per_rule origin', () => {
      const { thresholds, origin } = resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, undefined, {
        max_fp_rate: 0.05,
      });
      expect(thresholds.max_fp_rate).toBe(0.05);
      expect(origin).toBe('per_rule');
    });

    it('per-rule override wins over run-level override on the same key', () => {
      const { thresholds, origin } = resolveGateThresholds(
        DEFAULT_GATE_THRESHOLDS,
        { min_precision: 0.7, min_recall: 0.5 },
        { min_precision: 0.6 }
      );
      // per-rule wins
      expect(thresholds.min_precision).toBe(0.6);
      // run-level still applies for keys the per-rule override doesn't set
      expect(thresholds.min_recall).toBe(0.5);
      expect(origin).toBe('per_rule');
    });

    it('partial overrides only change the keys that are set', () => {
      const { thresholds } = resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, undefined, {
        marginal_band: 0.05,
      });
      expect(thresholds.marginal_band).toBe(0.05);
      expect(thresholds.min_precision).toBe(DEFAULT_GATE_THRESHOLDS.min_precision);
      expect(thresholds.min_recall).toBe(DEFAULT_GATE_THRESHOLDS.min_recall);
      expect(thresholds.min_variant_coverage).toBe(DEFAULT_GATE_THRESHOLDS.min_variant_coverage);
      expect(thresholds.max_fp_rate).toBe(DEFAULT_GATE_THRESHOLDS.max_fp_rate);
    });

    it('returns a frozen result so callers cannot mutate the resolved layer', () => {
      const { thresholds } = resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, {
        min_precision: 0.7,
      });
      expect(Object.isFrozen(thresholds)).toBe(true);
    });

    it('rejects out-of-range run-level overrides (negative)', () => {
      expect(() => resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, { min_precision: -0.1 })).toThrow(
        /run override.min_precision must be a finite number in \[0, 1\]/
      );
    });

    it('rejects out-of-range per-rule overrides (greater than 1)', () => {
      expect(() =>
        resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, undefined, { max_fp_rate: 1.5 })
      ).toThrow(/per-rule override.max_fp_rate must be a finite number in \[0, 1\]/);
    });

    it('rejects non-finite override values (NaN)', () => {
      expect(() =>
        resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, undefined, {
          marginal_band: Number.NaN,
        })
      ).toThrow(/per-rule override.marginal_band must be a finite number in \[0, 1\]/);
    });

    it('reports run_level origin when only the run override sets a key', () => {
      const { origin } = resolveGateThresholds(
        DEFAULT_GATE_THRESHOLDS,
        { min_recall: 0.4 },
        {} // empty per-rule override
      );
      expect(origin).toBe('run_level');
    });

    it('reports default origin when all overrides are empty objects', () => {
      const { origin, thresholds } = resolveGateThresholds(DEFAULT_GATE_THRESHOLDS, {}, {});
      expect(origin).toBe('default');
      expect(thresholds).toEqual(DEFAULT_GATE_THRESHOLDS);
    });
  });
});
