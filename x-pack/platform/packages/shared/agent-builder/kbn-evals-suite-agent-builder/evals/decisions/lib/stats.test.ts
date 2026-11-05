/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  assertRate,
  assertRateFields,
  binaryMetrics,
  mcnemar,
  noiseBandCount,
  percentile,
  pickThreshold,
  sweepThresholds,
  rateWithCi,
  rocAuc,
  thresholdSweep,
  wilsonInterval,
} from './stats';

describe('wilsonInterval', () => {
  it('matches the textbook value for 8/10', () => {
    const { low, high } = wilsonInterval(8, 10);
    expect(low).toBeCloseTo(0.4902, 3);
    expect(high).toBeCloseTo(0.9433, 3);
  });

  it('stays inside [0, 1] at the extremes', () => {
    expect(wilsonInterval(0, 20).low).toBe(0);
    expect(wilsonInterval(20, 20).high).toBe(1);
  });

  it('rejects k > n', () => {
    expect(() => wilsonInterval(5, 4)).toThrow();
  });
});

describe('binaryMetrics', () => {
  it('computes confusion, accuracy and balanced accuracy', () => {
    const labels = [true, true, true, true, false, false, false, false];
    const predictions = [true, true, true, false, true, false, false, false];
    const metrics = binaryMetrics(predictions, labels);
    expect(metrics).toMatchObject({ tp: 3, fn: 1, fp: 1, tn: 3, n: 8, accuracy: 0.75 });
    expect(metrics.balancedAccuracy).toBeCloseTo(0.75);
  });

  it('gives an always-positive constant 0.5 balanced accuracy on a mixed population', () => {
    const labels = [true, false, false, false];
    const metrics = binaryMetrics([true, true, true, true], labels);
    expect(metrics.accuracy).toBe(0.25);
    expect(metrics.balancedAccuracy).toBe(0.5);
  });

  it('leaves precision undefined when nothing is predicted positive', () => {
    expect(binaryMetrics([false, false], [true, false]).precision).toBeUndefined();
  });

  it('refuses mismatched populations', () => {
    expect(() => binaryMetrics([true], [true, false])).toThrow(/same population/);
  });
});

describe('mcnemar', () => {
  it('returns p=1 when the arms never disagree', () => {
    expect(mcnemar([true, false], [true, false])).toEqual({
      onlyA: 0,
      onlyB: 0,
      chi2: 0,
      exactP: 1,
    });
  });

  it('computes the exact two-sided binomial p-value', () => {
    // 10 discordant pairs, all favouring A: p = 2 * 0.5^10
    const a = Array(10).fill(true);
    const b = Array(10).fill(false);
    const result = mcnemar(a, b);
    expect(result.onlyA).toBe(10);
    expect(result.exactP).toBeCloseTo(2 / 1024, 6);
    expect(result.chi2).toBeCloseTo(8.1, 6);
  });
});

describe('threshold sweep', () => {
  it('uses 0.05 steps only', () => {
    const thresholds = sweepThresholds();
    expect(thresholds[0]).toBe(0.05);
    expect(thresholds[thresholds.length - 1]).toBe(0.95);
    expect(thresholds).toHaveLength(19);
  });

  it('predicts positive at probability >= threshold', () => {
    const rows = thresholdSweep([0.5, 0.49], [true, false]);
    const atHalf = rows.find(({ threshold }) => threshold === 0.5);
    expect(atHalf?.metrics.accuracy).toBe(1);
  });

  it('rejects probabilities outside [0, 1]', () => {
    expect(() => thresholdSweep([1.2], [true])).toThrow(/rate/);
  });

  it('breaks ties toward the prior threshold', () => {
    const rows = thresholdSweep([0.9, 0.1], [true, false]);
    expect(pickThreshold(rows, 0.5).threshold).toBe(0.5);
  });
});

describe('helpers', () => {
  it('assertRate rejects NaN', () => {
    expect(() => assertRate(NaN, 'x')).toThrow();
  });

  it('percentile uses nearest-rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 50)).toBeUndefined();
  });
});

describe('routing helpers', () => {
  it('rateWithCi omits the rate on an empty population but keeps the interval', () => {
    expect(rateWithCi(3, 4, 'x')).toMatchObject({ k: 3, n: 4, rate: 0.75 });
    expect(rateWithCi(0, 0, 'x').rate).toBeUndefined();
  });

  it('rocAuc counts ties as half and is undefined without both classes', () => {
    expect(rocAuc([0.9, 0.8], [0.1, 0.2])).toBe(1);
    expect(rocAuc([0.5], [0.5])).toBe(0.5);
    expect(rocAuc([], [0.1])).toBeUndefined();
  });

  it('noiseBandCount includes scores exactly one step from the threshold', () => {
    expect(noiseBandCount([0.45, 0.5, 0.55, 0.56, 0.3], 0.5)).toBe(3);
  });

  it('assertRateFields throws on a rate-like field outside [0, 1] anywhere in the tree', () => {
    expect(() => assertRateFields({ arms: [{ endToEnd: { rate: 0.4, k: 7 } }] })).not.toThrow();
    expect(() => assertRateFields({ arms: [{ fireRate: 1.2 }] })).toThrow();
  });
});
