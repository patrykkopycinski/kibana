/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { computeConcordance, type ModelVerdict } from './concordance';

const v = (alertId: string, classification: ModelVerdict['classification']): ModelVerdict => ({
  alertId,
  classification,
});

describe('computeConcordance', () => {
  it('reports perfect agreement and kappa=1 when both models match on every alert', () => {
    const a = [v('1', 'true_positive'), v('2', 'false_positive')];
    const b = [v('1', 'true_positive'), v('2', 'false_positive')];
    const r = computeConcordance(a, b);
    expect(r.comparedCount).toBe(2);
    expect(r.agreementRate).toBe(1);
    expect(r.cohensKappa).toBe(1);
    expect(r.disagreements).toEqual([]);
  });

  it('computes agreement rate and enumerates disagreements', () => {
    const a = [v('1', 'true_positive'), v('2', 'true_positive'), v('3', 'false_positive')];
    const b = [v('1', 'true_positive'), v('2', 'false_positive'), v('3', 'false_positive')];
    const r = computeConcordance(a, b);
    expect(r.comparedCount).toBe(3);
    expect(r.agreementCount).toBe(2);
    expect(r.agreementRate).toBeCloseTo(2 / 3);
    expect(r.disagreements).toEqual([{ alertId: '2', a: 'true_positive', b: 'false_positive' }]);
  });

  it('only compares alerts both models classified (drops undefined and unmatched ids)', () => {
    const a = [v('1', 'true_positive'), v('2', undefined), v('3', 'false_positive')];
    const b = [v('1', 'true_positive'), v('2', 'true_positive')];
    const r = computeConcordance(a, b);
    // alert 2 dropped (A undefined), alert 3 dropped (not in B) -> only alert 1 compared.
    expect(r.comparedCount).toBe(1);
    expect(r.agreementRate).toBe(1);
  });

  it('returns null rate and kappa when there is nothing to compare', () => {
    const r = computeConcordance([], []);
    expect(r.comparedCount).toBe(0);
    expect(r.agreementRate).toBeNull();
    expect(r.cohensKappa).toBeNull();
  });

  it('returns null kappa when a model used a single label (pe=1) even at full agreement', () => {
    const a = [v('1', 'true_positive'), v('2', 'true_positive')];
    const b = [v('1', 'true_positive'), v('2', 'true_positive')];
    const r = computeConcordance(a, b);
    expect(r.agreementRate).toBe(1);
    expect(r.cohensKappa).toBeNull();
  });

  it('yields kappa=0 at chance-level agreement', () => {
    // Each model splits 50/50 and they agree on exactly half -> po=0.5, pe=0.5, kappa=0.
    const a = [
      v('1', 'true_positive'),
      v('2', 'true_positive'),
      v('3', 'false_positive'),
      v('4', 'false_positive'),
    ];
    const b = [
      v('1', 'true_positive'),
      v('2', 'false_positive'),
      v('3', 'true_positive'),
      v('4', 'false_positive'),
    ];
    const r = computeConcordance(a, b);
    expect(r.agreementRate).toBe(0.5);
    expect(r.cohensKappa).toBeCloseTo(0);
  });
});
