/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The verdict a single mutation row carries. Derived server-side by joining
 * `.soc-mutation-intents` (governance gate result) with `.soc-outcomes`
 * (post-apply result) via `mutation_intent_id`.
 *
 *   - `applied`     → intent passed the gate, reached production, and has
 *                     NOT been rolled back in the window. Backed by a
 *                     `.soc-outcomes` row with `rolled_back: false`
 *                     (labels: "Canary applied", "Canary promoted", …).
 *   - `rolled_back` → intent reached production but was reverted. Backed by
 *                     a `.soc-outcomes` row with `rolled_back: true`
 *                     (labels: "Auto-rollback", "Slow rollback",
 *                     "Post-apply observation rolled back", …).
 *   - `blocked`     → intent never left the gate. Backed by a
 *                     `.soc-mutation-intents` row with
 *                     `governance_gate.status: "blocked"`. There is no
 *                     outcome row because we never applied.
 */
export type ArgusMutationVerdict = 'applied' | 'rolled_back' | 'blocked';

/**
 * Filter the UI tab exposes. `all` is the union and the default so the tab
 * always shows something on first paint.
 */
export type ArgusMutationFilter = ArgusMutationVerdict | 'all';

/**
 * Time windows exposed by the UI. Kept as a closed set so the UI toggle and
 * the server route are unambiguously in sync (no free-form date-math input
 * from the browser — that's reserved for the Pulse route which is operator-
 * driven).
 */
export type ArgusMutationWindow = '24h' | '7d';

export interface ArgusMutationRow {
  /** ISO timestamp the row sorts on. For applied/rolled_back this is the
   * outcome `@timestamp`; for blocked it's the mutation-intent `@timestamp`. */
  readonly timestamp: string;
  readonly verdict: ArgusMutationVerdict;
  readonly mutation_intent_id: string | null;
  readonly rule_id: string | null;
  /**
   * Human-facing one-liner (e.g. "GCP service-account privilege escalation").
   * Falls back to `title` if the upstream row only carries a full title.
   */
  readonly label: string | null;
  /** Long-form title from the upstream row. Useful when label is null. */
  readonly title: string | null;
  /** Free-form context string (e.g. "investigation+rollback took 309s"). */
  readonly subtitle: string | null;
  readonly actor_id: string | null;
  readonly actor_trust_tier: string | null;
  /** Populated on applied + rolled_back rows that carry it (outcome docs). */
  readonly applied_at: string | null;
  /** Populated on rolled_back rows only. */
  readonly rolled_back_at: string | null;
  /** Populated on rolled_back rows that the recovery pipeline has stamped. */
  readonly rollback_mttr_ms: number | null;
  /**
   * Populated on rolled_back rows only. Human-readable explanation of *why*
   * the mutation was reverted (e.g. "FP rate exceeded 2σ baseline within
   * 60s"). Sourced from `.soc-outcomes.rollback_reason`; if that field is
   * missing we fall back to the outcome `subtitle` so the UI always has
   * something to show for rolled-back rows that pre-date the field.
   */
  readonly rollback_reason: string | null;
  /** Populated on blocked rows only — always `"blocked"` there. */
  readonly gate_status: string | null;
  /**
   * Populated on blocked rows only. Human-readable explanation of *why* the
   * governance gate refused to let the mutation through (e.g. "Proposing
   * actor trust tier (bronze) below required floor (silver) for C2-class
   * rules"). Sourced from `.soc-mutation-intents.governance_gate.reason`.
   */
  readonly gate_reason: string | null;
}

export interface ArgusMutationCounts {
  readonly applied: number;
  readonly rolled_back: number;
  readonly blocked: number;
}

export interface ArgusMutationsResponse {
  /** ES date-math resolved window start (e.g. "now-24h"). */
  readonly window_start: string;
  /** ES date-math resolved window end (e.g. "now"). */
  readonly window_end: string;
  /** The filter the server applied. Echoed so the client can reconcile state. */
  readonly filter: ArgusMutationFilter;
  /**
   * Totals across the whole window, INDEPENDENT of the `filter` applied to
   * `rows`. UI pills use these for the badge counts so switching filters
   * doesn't erase the other pills' numbers.
   */
  readonly counts: ArgusMutationCounts;
  /** Max rows the server returned. Client should render `rows.length` rows. */
  readonly rows: readonly ArgusMutationRow[];
  /** Whether more rows exist server-side than were returned. */
  readonly truncated: boolean;
}
