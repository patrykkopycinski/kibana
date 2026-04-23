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
});
