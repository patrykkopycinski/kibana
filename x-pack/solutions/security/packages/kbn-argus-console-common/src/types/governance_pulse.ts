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
 * It carries six widget groups:
 *
 *   1. `mttd` — mean time to detect (vision-doc success metric 4.4) — B11
 *   2. `hours_saved` — proxy for "analyst time saved" (vision-doc success
 *      metric 4.3) — B12. See RFC `B12-hours-saved-proxy.md` for the model.
 *   3. `rollback_mttr` — governance recovery latency (pre-existing R6 signal)
 *   4. `mutation_throughput` — per-24h applied / rolled_back / blocked counts
 *   5. `drift` — open drift-detected mutation intents (unresolved)
 *   6. `tier_mix` — live actor trust-tier distribution
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
   * Mean time to detect (MTTD) — vision-doc success metric 4.4.
   *
   * Aggregated across all `.soc-outcomes` rows in the window with a populated
   * `time_to_detect` field (the time, in milliseconds, between the attack
   * signal first being available in events and the corresponding alert
   * firing). Null when no outcome row carries a `time_to_detect` value (cold
   * start or detection-only environment), so the UI can render "—" instead
   * of "0 ms" — a misleading "fast" reading.
   *
   * The p50 is the headline metric; the mean is shown alongside but tail-
   * resistant; the p95 surfaces tail-risk (slow detections that escape the
   * eye-of-the-median).
   */
  readonly mttd: GovernancePulseMttd | null;
  /**
   * Estimated analyst hours saved (proxy) — vision-doc success metric 4.3.
   *
   * The metric is *deliberately* a proxy: AutoDEX cannot read a real analyst
   * clock, so we estimate hours saved from work that AutoDEX measurably did
   * (rules authored, alerts auto-triaged, rollbacks auto-recovered) minus
   * work that AutoDEX *cost* the SOC (rollbacks that required human triage),
   * each weighted by a per-action minute constant. See
   * [`B12-hours-saved-proxy.md`](../../../../../../../../soc-simulation/docs/autodex/rfcs/B12-hours-saved-proxy.md)
   * for the full model and calibration plan.
   *
   * `null` only when none of the source counts are populated for the window
   * (cold start); when at least one count is non-zero the section populates
   * and the breakdown surfaces every contribution — including zero-hour rows
   * — so the UI can show "0 h triaged" rather than hiding the row.
   */
  readonly hours_saved: GovernancePulseHoursSaved | null;
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

/**
 * Mean Time To Detect — B11 / vision-doc 4.4.
 *
 * Sourced from `.soc-outcomes.time_to_detect` (mapped as `long`, milliseconds).
 * The detect-count is the volume signal: zero detection rows means the tile
 * renders "—" not "0 ms". When at least one row exists, avg / p50 / p95 are
 * surfaced; non-finite values (ES returns `null` on percentile failure) are
 * clamped to `null` so the UI never renders "NaN".
 */
export interface GovernancePulseMttd {
  /**
   * Number of outcomes in the window with a finite `time_to_detect` value.
   * Drives whether the tile renders at all — zero means the section is null
   * upstream.
   */
  readonly detect_count: number;
  /**
   * Arithmetic mean of `time_to_detect` (ms) across all matching outcomes
   * in the window. `null` when ES couldn't compute (cold start or
   * single-doc bucket).
   */
  readonly avg_ms: number | null;
  /**
   * 50th percentile of `time_to_detect` (ms). The headline tile metric —
   * tail-resistant, single outliers don't move it.
   */
  readonly p50_ms: number | null;
  /**
   * 95th percentile of `time_to_detect` (ms). Tail-risk signal — surfaces
   * detections that lag well beyond the typical case.
   */
  readonly p95_ms: number | null;
}

/**
 * Per-action minute constants used by the hours-saved proxy. Operator-tunable;
 * defaults are documented in the B12 RFC and exported as
 * `DEFAULT_HOURS_SAVED_CONSTANTS` from the builder module so callers can
 * spread + override.
 *
 * All values are positive minutes. The "human rollback" constant is *cost* —
 * the builder subtracts that contribution from the total.
 */
export interface HoursSavedConstants {
  /**
   * Minutes an analyst would have spent authoring + validating + deploying
   * a single net-new detection rule. Conservative default: 90 min.
   */
  readonly minutes_per_authoring: number;
  /**
   * Minutes an analyst would have spent triaging a single alert AutoDEX's
   * autonomous pipeline closed without human intervention. Default: 5 min.
   */
  readonly minutes_per_triage: number;
  /**
   * Minutes an analyst would have spent investigating + executing a single
   * rollback that AutoDEX handled itself. Default: 15 min.
   */
  readonly minutes_per_rollback_recovery: number;
  /**
   * Minutes an analyst *spent* on a single rollback that required human
   * triage (page + investigate + post-mortem). Subtracted from the total.
   * Default: 30 min.
   */
  readonly minutes_per_human_rollback: number;
}

/**
 * Hours-saved proxy payload — B12 / vision-doc success metric 4.3.
 *
 * `total_hours` is the headline; `breakdown` decomposes the math (so the UI
 * can render "12.5 h total — 6 h authoring + 5.5 h triage + 1 h auto-recovery
 * - 0 h human rollback"). `source_counts` exposes the raw inputs so an
 * operator dashboard can audit "how did we get to that number". The
 * `applied_constants` field carries the exact constants used to compute the
 * payload — making the proxy assumption set fully visible to consumers.
 *
 * `total_hours` may be **negative** when human-handled rollbacks outweigh the
 * other terms — that is intentional and surfaces the failure mode AutoDEX
 * governance exists to prevent. The UI renders negative totals in `danger`
 * tone.
 */
export interface GovernancePulseHoursSaved {
  /**
   * Headline metric — total estimated hours saved over the window. May be
   * negative when human-handled rollbacks dominate.
   */
  readonly total_hours: number;
  /**
   * Per-term decomposition of `total_hours`. Every term is non-negative
   * except `human_rollback_hours`, which is the (negative) cost contribution.
   */
  readonly breakdown: {
    readonly authoring_hours: number;
    readonly triage_hours: number;
    readonly recovery_hours: number;
    /** Negative contribution — analyst time *spent* on human-handled rollbacks. */
    readonly human_rollback_hours: number;
  };
  /**
   * Raw input counts used to compute the breakdown. Audit trail for
   * dashboards that want to verify the math.
   */
  readonly source_counts: {
    readonly rules_authored: number;
    readonly auto_triaged_outcomes: number;
    readonly auto_recovered_rollbacks: number;
    readonly human_rollbacks: number;
  };
  /**
   * Constants used to weight the source counts. When the operator overrides
   * defaults via the route's `?constants=` query param, the override travels
   * verbatim into this field — so dashboards always know exactly which
   * assumptions produced the headline.
   */
  readonly applied_constants: HoursSavedConstants;
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
