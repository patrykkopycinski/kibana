/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildScorecard, type Measurements, type ClaimScore } from './scorecard';

const byId = (scores: ClaimScore[], id: string): ClaimScore => {
  const s = scores.find((x) => x.id === id);
  if (!s) throw new Error(`No claim ${id}`);
  return s;
};

describe('buildScorecard', () => {
  it('C1 confirmed only when agreement is total AND both models are accurate', () => {
    const m: Measurements = {
      agreementRate: 1,
      cohensKappa: 1,
      accuracyByModel: { haiku: 0.95, sonnet: 0.98 },
    };
    expect(byId(buildScorecard(m), 'C1').verdict).toBe('confirmed');
  });

  it('C1 narrows when models agree fully but are not jointly accurate (agree-but-wrong)', () => {
    const m: Measurements = {
      agreementRate: 1,
      accuracyByModel: { haiku: 0.5, sonnet: 0.5 },
    };
    expect(byId(buildScorecard(m), 'C1').verdict).toBe('confirmed-but-narrow');
  });

  it('C1 not-supported when agreement drops below the narrow bar', () => {
    const m: Measurements = { agreementRate: 0.6, accuracyByModel: { haiku: 0.9, sonnet: 0.9 } };
    expect(byId(buildScorecard(m), 'C1').verdict).toBe('not-supported');
  });

  it('C1 insufficient-data when agreement was not measured', () => {
    expect(byId(buildScorecard({}), 'C1').verdict).toBe('insufficient-data');
  });

  it('C2 confirmed when cost ratio lands within tolerance of ~3x', () => {
    expect(byId(buildScorecard({ costRatio: 2.8 }), 'C2').verdict).toBe('confirmed');
  });

  it('C2 narrows when cheaper but off the claimed multiple', () => {
    expect(byId(buildScorecard({ costRatio: 1.5 }), 'C2').verdict).toBe('confirmed-but-narrow');
  });

  it('C3 not-supported when the "faster" model is actually slower', () => {
    expect(byId(buildScorecard({ latencyRatio: 0.7 }), 'C3').verdict).toBe('not-supported');
  });

  it('C2/C3 insufficient-data when ratios were not captured', () => {
    const scores = buildScorecard({ agreementRate: 1, accuracyByModel: { a: 0.9 } });
    expect(byId(scores, 'C2').verdict).toBe('insufficient-data');
    expect(byId(scores, 'C3').verdict).toBe('insufficient-data');
  });
});
