/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CLASSIFICATIONS, type Classification } from './constants';

/** One model's verdict on one alert, the minimal shape the concordance math needs. */
export interface ModelVerdict {
  alertId: string;
  classification: Classification | undefined;
}

/** A per-alert disagreement between the two models under comparison. */
export interface Disagreement {
  alertId: string;
  a: Classification | undefined;
  b: Classification | undefined;
}

export interface ConcordanceResult {
  /** Number of alerts both models classified (the intersection by alert id). */
  comparedCount: number;
  /** Alerts where both models emitted the same label. */
  agreementCount: number;
  /** agreementCount / comparedCount, or null when there is nothing to compare. */
  agreementRate: number | null;
  /**
   * Cohen's kappa: agreement corrected for the agreement expected by chance given each model's
   * own label distribution. 1 = perfect, 0 = chance-level, <0 = worse than chance, null when
   * undefined (nothing compared, or one model used a single label so chance agreement is 1).
   */
  cohensKappa: number | null;
  /** Every alert where the two models disagreed, for the scorecard's error analysis. */
  disagreements: Disagreement[];
}

/**
 * Cross-model concordance on a shared alert set. Joins the two models' verdicts by alert id,
 * over the intersection of alerts BOTH models classified (a missing/undefined verdict on either
 * side drops that alert from the comparison — you cannot score agreement on a non-answer).
 *
 * Re-derives the deck's implicit "the models mostly agree" claim into a measured agreement rate
 * plus a chance-corrected Cohen's kappa, and enumerates every disagreement for error analysis.
 */
export const computeConcordance = (
  modelA: ModelVerdict[],
  modelB: ModelVerdict[]
): ConcordanceResult => {
  const bById = new Map(modelB.map((v) => [v.alertId, v.classification]));

  const pairs = modelA
    .map((va) => ({ alertId: va.alertId, a: va.classification, b: bById.get(va.alertId) }))
    .filter(
      (p): p is { alertId: string; a: Classification; b: Classification } =>
        p.a !== undefined && p.b !== undefined
    );

  const comparedCount = pairs.length;
  const disagreements: Disagreement[] = pairs
    .filter((p) => p.a !== p.b)
    .map((p) => ({ alertId: p.alertId, a: p.a, b: p.b }));
  const agreementCount = comparedCount - disagreements.length;
  const agreementRate = comparedCount === 0 ? null : agreementCount / comparedCount;

  return {
    comparedCount,
    agreementCount,
    agreementRate,
    cohensKappa: cohensKappa(pairs),
    disagreements,
  };
};

/**
 * Cohen's kappa over paired categorical labels. po = observed agreement; pe = agreement
 * expected by chance from each rater's marginal label frequencies. kappa = (po - pe) / (1 - pe).
 * Returns null when there is nothing to compare or when pe == 1 (kappa undefined: a rater used a
 * single label across every alert, so chance agreement is already total).
 */
const cohensKappa = (pairs: Array<{ a: Classification; b: Classification }>): number | null => {
  const n = pairs.length;
  if (n === 0) return null;

  const po = pairs.filter((p) => p.a === p.b).length / n;

  let pe = 0;
  for (const label of CLASSIFICATIONS) {
    const pa = pairs.filter((p) => p.a === label).length / n;
    const pb = pairs.filter((p) => p.b === label).length / n;
    pe += pa * pb;
  }

  if (pe === 1) return null;
  return (po - pe) / (1 - pe);
};
