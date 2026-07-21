/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Phase 3 scorecard generator. Maps the re-derived measurements (agreement, per-model accuracy,
 * cost ratio, latency ratio) to a per-claim verdict against the deck's claims, so the scorecard
 * is reproducible from numbers rather than hand-authored. Thresholds are explicit and documented
 * inline; a claim is only "Confirmed" when its measured value clears the threshold the deck's
 * wording implies.
 */

export type ClaimVerdict =
  | 'confirmed'
  | 'confirmed-but-narrow'
  | 'not-supported'
  | 'insufficient-data';

/** Re-derived measurements the scorecard consumes. Any field may be undefined = not measured. */
export interface Measurements {
  /** Inter-model agreement rate on the compared alerts (0-1). C1. */
  agreementRate?: number | null;
  /** Cohen's kappa for the same comparison; distinguishes real agreement from chance. C1. */
  cohensKappa?: number | null;
  /** Per-model accuracy vs golden labels (0-1), keyed by model id. Guards "agree but wrong". */
  accuracyByModel?: Record<string, number>;
  /** cheaperModel cost / dearerModel cost, i.e. the multiple the cheaper model saves. C2. */
  costRatio?: number | null;
  /** dearerModel latency / fasterModel latency, i.e. the speedup multiple. C3. */
  latencyRatio?: number | null;
}

export interface ClaimScore {
  id: string;
  claim: string;
  verdict: ClaimVerdict;
  basis: string;
}

/**
 * Thresholds encoding the deck's implicit bar for each claim. Tunable in one place so the
 * scorecard's judgment is auditable rather than buried in conditionals.
 */
export const SCORECARD_THRESHOLDS = {
  /** "Agreed on all" -> full agreement confirms; a high-but-partial rate is narrow. */
  agreementConfirm: 1,
  agreementNarrow: 0.8,
  /** Min per-model accuracy for agreement to mean the models are jointly RIGHT, not jointly wrong. */
  jointAccuracyFloor: 0.8,
  /** "~3x cheaper" / "~2x faster": within +/-20% of the stated multiple confirms. */
  costRatioTarget: 3,
  latencyRatioTarget: 2,
  ratioTolerance: 0.2,
};

const withinTolerance = (value: number, target: number, tolerance: number): boolean =>
  Math.abs(value - target) / target <= tolerance;

/** C1 — inter-model agreement. Confirmed only when agreement is total AND both models are accurate. */
const scoreAgreement = (m: Measurements): ClaimScore => {
  const { agreementRate, cohensKappa, accuracyByModel } = m;
  if (agreementRate == null) {
    return {
      id: 'C1',
      claim: 'Models agreed on all alerts',
      verdict: 'insufficient-data',
      basis: 'No agreement rate measured.',
    };
  }
  const accuracies = accuracyByModel ? Object.values(accuracyByModel) : [];
  const jointlyAccurate =
    accuracies.length > 0 && accuracies.every((a) => a >= SCORECARD_THRESHOLDS.jointAccuracyFloor);
  const kappaNote = cohensKappa == null ? '' : ` kappa=${cohensKappa.toFixed(2)}.`;

  if (agreementRate >= SCORECARD_THRESHOLDS.agreementConfirm && jointlyAccurate) {
    return {
      id: 'C1',
      claim: 'Models agreed on all alerts',
      verdict: 'confirmed',
      basis: `agreement=100% and both models >= ${SCORECARD_THRESHOLDS.jointAccuracyFloor} accuracy.${kappaNote}`,
    };
  }
  if (agreementRate >= SCORECARD_THRESHOLDS.agreementNarrow) {
    const why = jointlyAccurate
      ? 'agreement is high but not total'
      : 'models agree but are not jointly accurate (agreement != correctness)';
    return {
      id: 'C1',
      claim: 'Models agreed on all alerts',
      verdict: 'confirmed-but-narrow',
      basis: `agreement=${(agreementRate * 100).toFixed(0)}%; ${why}.${kappaNote}`,
    };
  }
  return {
    id: 'C1',
    claim: 'Models agreed on all alerts',
    verdict: 'not-supported',
    basis: `agreement=${(agreementRate * 100).toFixed(0)}% below ${
      SCORECARD_THRESHOLDS.agreementNarrow * 100
    }% bar.${kappaNote}`,
  };
};

/** Generic ratio-claim scorer for C2 (cost) and C3 (latency): "~Nx" confirmed within tolerance. */
const scoreRatio = (
  id: string,
  claim: string,
  measured: number | null | undefined,
  target: number
): ClaimScore => {
  if (measured == null) {
    return {
      id,
      claim,
      verdict: 'insufficient-data',
      basis: 'Ratio not measured (token/latency capture required).',
    };
  }
  if (withinTolerance(measured, target, SCORECARD_THRESHOLDS.ratioTolerance)) {
    return {
      id,
      claim,
      verdict: 'confirmed',
      basis: `measured ${measured.toFixed(2)}x vs claimed ~${target}x (within ${
        SCORECARD_THRESHOLDS.ratioTolerance * 100
      }%).`,
    };
  }
  if (measured >= 1) {
    return {
      id,
      claim,
      verdict: 'confirmed-but-narrow',
      basis: `direction holds (${measured.toFixed(2)}x) but off the claimed ~${target}x.`,
    };
  }
  return {
    id,
    claim,
    verdict: 'not-supported',
    basis: `measured ${measured.toFixed(2)}x contradicts the claimed ~${target}x.`,
  };
};

/**
 * Builds the per-claim scorecard from re-derived measurements. Only the data-backed claims
 * (C1 agreement, C2 cost, C3 latency) are auto-scored; C4-C6 in the deck are sampling/product
 * judgments that this suite does not measure and are omitted here (tracked in VALIDATION_PLAN.md).
 */
export const buildScorecard = (m: Measurements): ClaimScore[] => [
  scoreAgreement(m),
  scoreRatio('C2', 'Cheaper model ~3x cheaper', m.costRatio, SCORECARD_THRESHOLDS.costRatioTarget),
  scoreRatio(
    'C3',
    'Faster model ~2x faster',
    m.latencyRatio,
    SCORECARD_THRESHOLDS.latencyRatioTarget
  ),
];
