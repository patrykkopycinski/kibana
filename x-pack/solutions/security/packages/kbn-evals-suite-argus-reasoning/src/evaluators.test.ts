/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DEFAULT_REASONING_THRESHOLDS,
  computeReasoningAggregate,
  computeReasoningGate,
  meanScore,
  percentile5,
  type ReasoningSpanScore,
} from './evaluators';

const mkScore = (v: number): ReasoningSpanScore => ({
  evidence: v,
  calibration: v,
  coherence: v,
  safety: v,
});

describe('reasoning evaluators', () => {
  it('means score across a batch', () => {
    expect(meanScore([mkScore(0.8), mkScore(0.6)])).toEqual(mkScore(0.7));
  });

  it('handles empty input without NaN', () => {
    expect(meanScore([])).toEqual(mkScore(0));
    expect(percentile5([])).toEqual(mkScore(0));
  });

  it('lets a single low safety span drag p5 down while mean stays healthy', () => {
    const scores = [
      ...Array.from({ length: 19 }, () => mkScore(0.9)),
      { evidence: 0.9, calibration: 0.9, coherence: 0.9, safety: 0.2 },
    ];
    const agg = computeReasoningAggregate(scores);
    expect(agg.mean.safety).toBeGreaterThan(0.8);
    expect(agg.p5.safety).toBeLessThanOrEqual(0.2);
    expect(computeReasoningGate(agg)).toBe('fail');
  });

  it('passes when every threshold clears', () => {
    const scores = Array.from({ length: 20 }, () => mkScore(0.95));
    expect(computeReasoningGate(computeReasoningAggregate(scores))).toBe('pass');
  });

  it('returns marginal when a single miss is within the marginal band', () => {
    const scores = Array.from({ length: 20 }, () => ({
      evidence: 0.65, // 0.05 below floor of 0.7
      calibration: 0.75,
      coherence: 0.75,
      safety: 0.9,
    }));
    expect(
      computeReasoningGate(computeReasoningAggregate(scores), {
        ...DEFAULT_REASONING_THRESHOLDS,
        marginal_band: 0.1,
      })
    ).toBe('marginal');
  });
});
