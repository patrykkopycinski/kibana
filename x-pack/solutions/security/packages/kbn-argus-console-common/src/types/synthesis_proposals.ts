/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Argus "Proposals" surface — exposes the Pareto-synthesis candidate set
 * (chosen / frontier / dominated) that's already written to every
 * `.soc-recommendations` doc under `argus.synthesis`. The data model on
 * disk is owned by `@kbn/argus-exploit-to-detection` (see
 * `SynthesisCandidateRef` in `mutation_intent.ts`); this module re-shapes
 * it for the UI and layers in a dominance-reason explanation so the
 * console can answer "why wasn't this candidate picked?" for every
 * dominated row without the frontend having to re-run Pareto math.
 */

/**
 * Where a candidate sits relative to the final pick.
 *   - `chosen`    : the candidate promoted to the detection-eval gate.
 *   - `frontier`  : Pareto-optimal, but not picked by the tradeoff weights.
 *                   Still useful — a recall-biased tenant might have picked
 *                   this one instead.
 *   - `dominated` : strictly worse than at least one frontier candidate on
 *                   every metric. Kept for audit, never promoted.
 */
export type ArgusSynthesisProposalTier = 'chosen' | 'frontier' | 'dominated';

/**
 * Rule-composition knobs. Mirrors `CandidateComposition` from
 * `@kbn/argus-exploit-to-detection` verbatim so this module stays a pure
 * consumer of the recommendation doc — no schema duplication, and adding
 * a new knob upstream does not silently diverge the UI.
 */
export interface ArgusSynthesisComposition {
  readonly must_anchor_subset: 'all' | 'primary_only';
  readonly wildcard_retention: 'full' | 'strict';
  readonly minimum_should_match: 1 | 2;
}

/**
 * Variant-coverage axes as emitted by `@kbn/argus-exploit-to-detection`.
 * Duplicated locally so this package stays a pure consumer (no cross-plugin
 * import); kept in sync by convention with `VariantAxis` upstream.
 */
export type ArgusVariantAxisName =
  | 'command_args'
  | 'encoding_layers'
  | 'process_ancestry'
  | 'timing_jitter_ms'
  | 'named_pipe_vs_stdout'
  | 'living_off_land';

/**
 * Predicted-performance profile. All fields live on `[0, 1]`. These are
 * the heuristic numbers emitted by `synthesize_pareto.ts`; the
 * authoritative numbers land later on `.soc-backtest-results`.
 */
export interface ArgusSynthesisPredicted {
  readonly precision: number;
  readonly recall: number;
  readonly fp_rate: number;
  readonly axis_fn_mean: number;
  /**
   * Per-axis coverage in `[0, 1]`. Populated by synthesizers that emit the
   * full `axis_fn` record (R3+); older seeds only carry `axis_fn_mean`, in
   * which case this is omitted and the UI falls back to the mean-only view.
   */
  readonly axis_fn?: Readonly<Partial<Record<ArgusVariantAxisName, number>>>;
}

/**
 * Per-axis explanation of why a dominated candidate was beaten. Each entry
 * names one of the four scored axes along with the comparison that
 * mattered: the dominated candidate's value vs. the dominator's, formatted
 * so the UI can render it without rounding logic of its own.
 *
 * Only axes where the dominator is strictly better appear in this list.
 * `direction` encodes whether higher or lower is better, which the UI uses
 * to pick the right glyph ("↓ precision was 0.72 vs 0.82").
 */
export interface ArgusSynthesisDominationReason {
  readonly axis: 'precision' | 'recall' | 'fp_rate' | 'axis_fn_mean';
  readonly direction: 'higher_is_better' | 'lower_is_better';
  readonly candidate_value: number;
  readonly dominator_value: number;
}

/**
 * Flat, UI-ready row. One entry per candidate considered. The ordering in
 * the response follows the deterministic composition grid from
 * `synthesize_pareto.ts` so a user reading the same CVE later gets the
 * same list order.
 */
export interface ArgusSynthesisProposal {
  readonly candidate_id: string;
  readonly tier: ArgusSynthesisProposalTier;
  readonly composition: ArgusSynthesisComposition;
  readonly predicted: ArgusSynthesisPredicted;
  /**
   * Populated only when `tier === 'dominated'`. Identifies the frontier
   * candidate that beats this one and enumerates the axes on which the
   * dominator is strictly better. `undefined` for `chosen` and
   * `frontier` tiers.
   */
  readonly dominated_by?: {
    readonly candidate_id: string;
    readonly reasons: readonly ArgusSynthesisDominationReason[];
  };
}

/**
 * Weighting the tradeoff pick used to select `chosen` from `frontier`.
 * Higher weight means the axis mattered more when breaking Pareto ties.
 * Surfaced so users can see "this tenant is tuned precision-first".
 */
export interface ArgusSynthesisWeights {
  readonly precision: number;
  readonly recall: number;
  readonly fp_rate: number;
  readonly axis_fn: number;
}

/**
 * Response for the single-CVE drill-in (`/argus/synthesis?cve=...`).
 * `missing_reason` is set when the advisory resolves but no recommendation
 * carries a `argus.synthesis` block — either the advisory pre-dates R3 or
 * synthesis hasn't run yet. UI renders an explanatory empty state instead
 * of a blank table.
 */
export interface ArgusSynthesisResponse {
  readonly cve_id: string;
  readonly advisory_id?: string;
  readonly recommendation_id?: string;
  readonly draft_rule_id?: string;
  readonly weights?: ArgusSynthesisWeights;
  readonly proposals: readonly ArgusSynthesisProposal[];
  readonly missing_reason?:
    | 'advisory_not_found'
    | 'recommendation_not_found'
    | 'no_synthesis_metadata';
}

/**
 * Compact row for the global Proposals tab list view.
 */
export interface ArgusSynthesisRecentRow {
  readonly recommendation_id: string;
  readonly cve_id: string;
  readonly advisory_id: string;
  readonly timestamp: string;
  readonly chosen_candidate_id: string;
  readonly frontier_size: number;
  readonly dominated_count: number;
  readonly predicted: ArgusSynthesisPredicted;
}

/**
 * Time window for the recent-proposals list. Values match the existing
 * `E2dFlowWindow` / `ArgusMutationWindow` conventions so deep-link query
 * params stay uniform across the console.
 */
export type ArgusSynthesisWindow = '24h' | '7d';

export interface ArgusSynthesisRecentResponse {
  readonly window: ArgusSynthesisWindow;
  readonly rows: readonly ArgusSynthesisRecentRow[];
}
