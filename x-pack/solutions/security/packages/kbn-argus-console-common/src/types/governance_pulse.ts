/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Canonical shape of the ARGUS governance-pulse payload surfaced in the
 * "ARGUS pulse" panel.
 *
 * The Pulse panel is the top-of-page "is ARGUS working right now?" strip from
 * the ARGUS Console design doc (soc-simulation/docs/argus/phase-3/argus-console.md).
 * It carries four widget groups:
 *
 *   1. `rollback_mttr` — governance recovery latency (pre-existing R6 signal)
 *   2. `mutation_throughput` — per-24h applied / rolled_back / blocked counts
 *   3. `drift` — open drift-detected mutation intents (unresolved)
 *   4. `tier_mix` — live actor trust-tier distribution
 *
 * Every sub-section degrades to `null` when no docs match, so the UI can
 * render "—" rather than zeros when the cluster is cold.
 */
export interface GovernancePulse {
  /**
   * ISO8601 timestamp of the aggregation window start (inclusive).
   */
  readonly window_start: string;
  /**
   * ISO8601 timestamp of the aggregation window end (exclusive / "now").
   */
  readonly window_end: string;
  /**
   * Rollback MTTR (mean-time-to-recovery) aggregated across all actors over
   * the window. Null when no rollback outcomes carry a `rollback_mttr_ms`
   * field (cold start), so the UI can render "—" instead of "0 ms".
   */
  readonly rollback_mttr: GovernancePulseMttr | null;
  /**
   * Mutation throughput over the window — how many mutation_intents
   * successfully applied, how many rolled back, how many were blocked by
   * governance gates. Null when no mutation-intent docs exist in the window.
   */
  readonly mutation_throughput: GovernancePulseThroughput | null;
  /**
   * Drift signals currently open (unresolved) across all mutation_intents.
   * This is a point-in-time count, not windowed — a drift_detected intent
   * stays "open" until it is re-evaluated and either re-applied or rolled back.
   * Null when the drift index is missing.
   */
  readonly drift: GovernancePulseDrift | null;
  /**
   * Live actor trust-tier distribution. Reads the most recent tier per actor
   * from `.soc-actor-trust-tiers`. Null when the index is missing.
   */
  readonly tier_mix: GovernancePulseTierMix | null;
}

export interface GovernancePulseMttr {
  /**
   * Number of `.soc-outcomes` rows with `rolled_back=true` and an
   * `rollback_mttr_ms` value in the window. Primary volume signal.
   */
  readonly rollback_count: number;
  /**
   * Arithmetic mean of `rollback_mttr_ms` across all rollback outcomes in
   * the window, in milliseconds. `null` when `rollback_count === 0`.
   */
  readonly avg_ms: number | null;
  /**
   * 50th percentile of `rollback_mttr_ms`. `null` when `rollback_count === 0`.
   * The p50 is the headline metric on the Pulse tile — a single outlier can
   * skew the mean, but the median survives.
   */
  readonly p50_ms: number | null;
  /**
   * 95th percentile of `rollback_mttr_ms`. `null` when `rollback_count === 0`.
   * Shown on the tile description as a tail-risk signal.
   */
  readonly p95_ms: number | null;
}

/**
 * Per-24h mutation throughput breakdown. Counts read from `.soc-outcomes`
 * (applied / rolled_back) and `.soc-mutation-intents` (blocked_by_governance).
 *
 * All three counts are non-negative integers; null on the whole object means
 * "no mutation-intent activity in the window", which the UI surfaces as "—".
 */
export interface GovernancePulseThroughput {
  /**
   * Mutations that reached `applied` state and stayed there — not rolled back.
   * Derived as `outcome_count - rollback_count`.
   */
  readonly applied: number;
  /**
   * Mutations that were rolled back after being applied. Same as
   * `rollback_mttr.rollback_count` when both sections populate, but kept
   * separate so the throughput tile can render even when MTTR data is absent.
   */
  readonly rolled_back: number;
  /**
   * Mutations whose `governance_gate` field was set to `blocked` in
   * `.soc-mutation-intents` — usually because of an injection-surface flag,
   * a failed eval gate, or an operator veto.
   */
  readonly blocked: number;
}

/**
 * Drift-detected mutation intent summary. The "open" count is the number of
 * intents with `drift_detected=true` and no corresponding re-apply or rollback
 * resolution yet.
 */
export interface GovernancePulseDrift {
  /**
   * Count of mutation_intents that have fired a `drift_detected` signal but
   * have not yet been re-evaluated to resolution (re-apply or rollback).
   */
  readonly open_count: number;
  /**
   * Count of drift signals resolved in the window (either by re-apply or by
   * rollback). Shown on the tile as "× resolved" context.
   */
  readonly resolved_count: number;
}

/**
 * Actor trust-tier distribution. Reads the most-recent-by-actor row from
 * `.soc-actor-trust-tiers` so actors demoted from `trusted` to `probationary`
 * are counted once (in their current tier).
 */
export interface GovernancePulseTierMix {
  /** Count of actors currently at `trusted`. */
  readonly trusted: number;
  /** Count of actors currently at `probationary`. */
  readonly probationary: number;
  /** Count of actors currently at `untrusted`. */
  readonly untrusted: number;
  /** Count of actors currently at `system` (machine-only principals). */
  readonly system: number;
  /** Total actors seen in the tier index. Equals the sum of the four tiers. */
  readonly total: number;
}

/**
 * Builder result. Always carries the window bounds so the UI can label the
 * tile honestly ("last 24h" / "last 7d" / custom range).
 */
export type GovernancePulseBuildResult = GovernancePulse;
