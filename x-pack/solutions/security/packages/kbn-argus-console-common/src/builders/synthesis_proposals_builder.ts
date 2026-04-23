/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusSynthesisComposition,
  ArgusSynthesisDominationReason,
  ArgusSynthesisPredicted,
  ArgusSynthesisProposal,
  ArgusSynthesisRecentResponse,
  ArgusSynthesisRecentRow,
  ArgusSynthesisResponse,
  ArgusSynthesisWeights,
  ArgusSynthesisWindow,
  ArgusVariantAxisName,
} from '../types/synthesis_proposals';

const ARGUS_VARIANT_AXES: readonly ArgusVariantAxisName[] = [
  'command_args',
  'encoding_layers',
  'process_ancestry',
  'timing_jitter_ms',
  'named_pipe_vs_stdout',
  'living_off_land',
] as const;

/**
 * Raw shape of a candidate as it lives on `.soc-recommendations` docs under
 * `argus.synthesis.{chosen,frontier,dominated}`. Mirrors
 * `SynthesisCandidateRef` from `@kbn/argus-exploit-to-detection` but kept
 * local so this package stays free of a cross-plugin import.
 */
export interface SynthesisRawCandidate {
  readonly candidate_id?: string;
  readonly composition?: Partial<ArgusSynthesisComposition>;
  readonly predicted?: Partial<ArgusSynthesisPredicted>;
}

export interface SynthesisRawBlock {
  readonly chosen?: SynthesisRawCandidate;
  readonly frontier?: readonly SynthesisRawCandidate[];
  readonly dominated?: readonly SynthesisRawCandidate[];
  readonly weights?: Partial<ArgusSynthesisWeights>;
}

export interface SynthesisRawRecommendationDoc {
  readonly _id?: string;
  readonly _source?: {
    readonly '@timestamp'?: string;
    readonly rule_id?: string;
    readonly argus?: { readonly synthesis?: SynthesisRawBlock };
  };
}

export interface SynthesisRawAdvisoryDoc {
  readonly _id?: string;
  readonly _source?: {
    readonly advisory_id?: string;
    readonly cve_id?: string;
    readonly recommendation_id?: string;
    readonly draft_rule_id?: string;
  };
}

// --------------------------------------------------------------------------
// Defensive normalisation. Recommendation docs are written by the E2D CLI
// and trusted upstream, but the builder still has to survive partial docs
// (older advisories pre-R3, hand-seeded fixtures, future schema drift).
// --------------------------------------------------------------------------

const clamp01 = (n: unknown): number => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

const normaliseComposition = (
  raw: Partial<ArgusSynthesisComposition> | undefined
): ArgusSynthesisComposition => ({
  must_anchor_subset: raw?.must_anchor_subset === 'primary_only' ? 'primary_only' : 'all',
  wildcard_retention: raw?.wildcard_retention === 'strict' ? 'strict' : 'full',
  minimum_should_match: raw?.minimum_should_match === 2 ? 2 : 1,
});

const normaliseAxisFn = (
  raw: Readonly<Partial<Record<ArgusVariantAxisName, number>>> | undefined
): Readonly<Partial<Record<ArgusVariantAxisName, number>>> | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const entries: Array<[ArgusVariantAxisName, number]> = [];
  for (const axis of ARGUS_VARIANT_AXES) {
    const value = raw[axis];
    if (typeof value === 'number' && Number.isFinite(value)) {
      entries.push([axis, clamp01(value)]);
    }
  }
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Readonly<Partial<Record<ArgusVariantAxisName, number>>>;
};

const normalisePredicted = (
  raw: Partial<ArgusSynthesisPredicted> | undefined
): ArgusSynthesisPredicted => {
  const axisFn = normaliseAxisFn(raw?.axis_fn);
  return {
    precision: clamp01(raw?.precision),
    recall: clamp01(raw?.recall),
    fp_rate: clamp01(raw?.fp_rate),
    axis_fn_mean: clamp01(raw?.axis_fn_mean),
    ...(axisFn ? { axis_fn: axisFn } : {}),
  };
};

// --------------------------------------------------------------------------
// Pareto dominance. "A dominates B" means A is at least as good on every
// axis and strictly better on at least one. For this surface the axes are:
//   * precision       — higher is better
//   * recall          — higher is better
//   * axis_fn_mean    — higher is better (fraction of advisory signals still
//                        exercised by the candidate, ceteris paribus)
//   * fp_rate         — lower is better
// --------------------------------------------------------------------------

interface AxisSpec {
  readonly axis: ArgusSynthesisDominationReason['axis'];
  readonly direction: ArgusSynthesisDominationReason['direction'];
}

const AXES: readonly AxisSpec[] = [
  { axis: 'precision', direction: 'higher_is_better' },
  { axis: 'recall', direction: 'higher_is_better' },
  { axis: 'axis_fn_mean', direction: 'higher_is_better' },
  { axis: 'fp_rate', direction: 'lower_is_better' },
] as const;

const EPSILON = 1e-9;

const isBetter = (a: number, b: number, direction: AxisSpec['direction']): boolean => {
  if (direction === 'higher_is_better') return a > b + EPSILON;
  return a < b - EPSILON;
};

const isAtLeastAsGood = (a: number, b: number, direction: AxisSpec['direction']): boolean => {
  if (direction === 'higher_is_better') return a >= b - EPSILON;
  return a <= b + EPSILON;
};

export const dominates = (
  dominator: ArgusSynthesisPredicted,
  candidate: ArgusSynthesisPredicted
): boolean => {
  let strictlyBetter = false;
  for (const { axis, direction } of AXES) {
    const domValue = dominator[axis];
    const candValue = candidate[axis];
    if (!isAtLeastAsGood(domValue, candValue, direction)) return false;
    if (isBetter(domValue, candValue, direction)) strictlyBetter = true;
  }
  return strictlyBetter;
};

/**
 * For a given dominated candidate, pick the first frontier candidate that
 * Pareto-dominates it and return the axes where the dominator is strictly
 * better. "First" follows the deterministic frontier ordering so identical
 * inputs always produce identical explanations — important for audit /
 * snapshot tests.
 */
export const findDominator = (
  candidate: ArgusSynthesisPredicted,
  frontier: ReadonlyArray<{ candidate_id: string; predicted: ArgusSynthesisPredicted }>
): { candidate_id: string; reasons: readonly ArgusSynthesisDominationReason[] } | undefined => {
  for (const entry of frontier) {
    if (dominates(entry.predicted, candidate)) {
      const reasons: ArgusSynthesisDominationReason[] = [];
      for (const { axis, direction } of AXES) {
        if (isBetter(entry.predicted[axis], candidate[axis], direction)) {
          reasons.push({
            axis,
            direction,
            candidate_value: candidate[axis],
            dominator_value: entry.predicted[axis],
          });
        }
      }
      return { candidate_id: entry.candidate_id, reasons };
    }
  }
  return undefined;
};

// --------------------------------------------------------------------------
// Per-CVE builder.
// --------------------------------------------------------------------------

export interface BuildSynthesisProposalsInput {
  readonly cveId: string;
  readonly advisoryDoc?: SynthesisRawAdvisoryDoc;
  readonly recommendationDoc?: SynthesisRawRecommendationDoc;
}

const buildProposalRow = (
  raw: SynthesisRawCandidate,
  tier: ArgusSynthesisProposal['tier'],
  fallbackId: string
): ArgusSynthesisProposal => ({
  candidate_id: raw.candidate_id ?? fallbackId,
  tier,
  composition: normaliseComposition(raw.composition),
  predicted: normalisePredicted(raw.predicted),
});

const normaliseWeights = (
  raw: Partial<ArgusSynthesisWeights> | undefined
): ArgusSynthesisWeights | undefined => {
  if (!raw) return undefined;
  const { precision, recall, fp_rate: fpRate, axis_fn: axisFn } = raw;
  if (
    typeof precision !== 'number' ||
    typeof recall !== 'number' ||
    typeof fpRate !== 'number' ||
    typeof axisFn !== 'number'
  ) {
    return undefined;
  }
  return { precision, recall, fp_rate: fpRate, axis_fn: axisFn };
};

export const buildSynthesisProposals = ({
  cveId,
  advisoryDoc,
  recommendationDoc,
}: BuildSynthesisProposalsInput): ArgusSynthesisResponse => {
  const advisorySource = advisoryDoc?._source;
  const advisoryId = advisorySource?.advisory_id ?? advisoryDoc?._id;

  if (!advisoryDoc || !advisorySource) {
    return { cve_id: cveId, proposals: [], missing_reason: 'advisory_not_found' };
  }

  const recommendationSource = recommendationDoc?._source;
  const recommendationId = recommendationDoc?._id ?? advisorySource.recommendation_id;
  const draftRuleId = advisorySource.draft_rule_id ?? recommendationSource?.rule_id;

  if (!recommendationDoc || !recommendationSource) {
    return {
      cve_id: cveId,
      advisory_id: advisoryId,
      ...(recommendationId ? { recommendation_id: recommendationId } : {}),
      ...(draftRuleId ? { draft_rule_id: draftRuleId } : {}),
      proposals: [],
      missing_reason: 'recommendation_not_found',
    };
  }

  const synthesis = recommendationSource.argus?.synthesis;
  if (!synthesis || !synthesis.chosen) {
    return {
      cve_id: cveId,
      advisory_id: advisoryId,
      ...(recommendationId ? { recommendation_id: recommendationId } : {}),
      ...(draftRuleId ? { draft_rule_id: draftRuleId } : {}),
      proposals: [],
      missing_reason: 'no_synthesis_metadata',
    };
  }

  const chosenRow = buildProposalRow(synthesis.chosen, 'chosen', 'chosen');

  const frontierRaw = synthesis.frontier ?? [];
  // Frontier siblings = frontier entries other than the chosen pick. The
  // chosen is always on the frontier, so we filter it by id to avoid
  // double-listing.
  const frontierRows: ArgusSynthesisProposal[] = frontierRaw
    .filter((entry) => entry.candidate_id !== chosenRow.candidate_id)
    .map((entry, i) => buildProposalRow(entry, 'frontier', `frontier-${i}`));

  // For dominance reasons we compare against the full frontier (chosen
  // included) so a dominated candidate can be explained as "beaten by the
  // chosen pick" when that's the tightest explanation.
  const frontierPool = [
    { candidate_id: chosenRow.candidate_id, predicted: chosenRow.predicted },
    ...frontierRows.map((row) => ({ candidate_id: row.candidate_id, predicted: row.predicted })),
  ];

  const dominatedRaw = synthesis.dominated ?? [];
  const dominatedRows: ArgusSynthesisProposal[] = dominatedRaw.map((entry, i) => {
    const row = buildProposalRow(entry, 'dominated', `dominated-${i}`);
    const dominator = findDominator(row.predicted, frontierPool);
    return dominator ? { ...row, dominated_by: dominator } : row;
  });

  const normalisedWeights = normaliseWeights(synthesis.weights);

  return {
    cve_id: cveId,
    advisory_id: advisoryId,
    ...(recommendationId ? { recommendation_id: recommendationId } : {}),
    ...(draftRuleId ? { draft_rule_id: draftRuleId } : {}),
    ...(normalisedWeights ? { weights: normalisedWeights } : {}),
    proposals: [chosenRow, ...frontierRows, ...dominatedRows],
  };
};

// --------------------------------------------------------------------------
// Recent-proposals list builder (global "Proposals" tab).
// --------------------------------------------------------------------------

export interface BuildRecentProposalsInput {
  readonly window: ArgusSynthesisWindow;
  /**
   * Recommendation docs, already filtered server-side to ones that carry
   * `argus.synthesis`. We intentionally do not re-filter here: the caller
   * owns the index query and the list ordering.
   */
  readonly recommendations: readonly SynthesisRawRecommendationDoc[];
  /**
   * Advisory lookups keyed by `recommendation_id`. Missing entries are
   * fine — the row is still emitted with cve_id = 'unknown' so operators
   * can spot orphan recommendations.
   */
  readonly advisoryByRecommendationId?: ReadonlyMap<string, SynthesisRawAdvisoryDoc>;
}

export const buildRecentProposals = ({
  window,
  recommendations,
  advisoryByRecommendationId,
}: BuildRecentProposalsInput): ArgusSynthesisRecentResponse => {
  const rows: ArgusSynthesisRecentRow[] = [];
  for (const rec of recommendations) {
    const recId = rec._id;
    const source = rec._source;
    const synthesis = source?.argus?.synthesis;
    if (recId && source && synthesis && synthesis.chosen) {
      const advisory = advisoryByRecommendationId?.get(recId);
      const advisorySource = advisory?._source;

      const chosen = synthesis.chosen;
      const frontierCount = synthesis.frontier?.length ?? 0;
      const dominatedCount = synthesis.dominated?.length ?? 0;

      rows.push({
        recommendation_id: recId,
        cve_id: advisorySource?.cve_id ?? 'unknown',
        advisory_id: advisorySource?.advisory_id ?? advisory?._id ?? 'unknown',
        timestamp: source['@timestamp'] ?? '',
        chosen_candidate_id: chosen.candidate_id ?? 'chosen',
        frontier_size: frontierCount,
        dominated_count: dominatedCount,
        predicted: normalisePredicted(chosen.predicted),
      });
    }
  }
  return { window, rows };
};
