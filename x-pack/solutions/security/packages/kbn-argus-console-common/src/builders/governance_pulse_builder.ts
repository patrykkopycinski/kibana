/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  GovernancePulseBuildResult,
  GovernancePulseDrift,
  GovernancePulseHoursSaved,
  GovernancePulseMttd,
  GovernancePulseMttr,
  GovernancePulseThroughput,
  GovernancePulseTierMix,
  HoursSavedConstants,
} from '../types/governance_pulse';

/**
 * Default per-action minute constants for the B12 hours-saved proxy.
 *
 * See [B12 RFC §2 — "Default minute constants"](../../../../../../../../soc-simulation/docs/autodex/rfcs/B12-hours-saved-proxy.md#default-minute-constants)
 * for the rationale. These are conservative defaults — every tenant SHOULD
 * override after one quarter of operation using their own task-tracking
 * data. The route accepts overrides via the `?constants=` query parameter.
 */
export const DEFAULT_HOURS_SAVED_CONSTANTS: HoursSavedConstants = {
  minutes_per_authoring: 90,
  minutes_per_triage: 5,
  minutes_per_rollback_recovery: 15,
  minutes_per_human_rollback: 30,
};

/**
 * Loose shape of the ES `aggregations` block returned by the governance-pulse
 * search over `.soc-outcomes`. We intentionally don't depend on the ES client
 * types here — this file is isomorphic (browser + server) and the ES client
 * lives server-side.
 *
 * The route will pass `response.aggregations` directly; missing fields mean
 * "no matching docs in the window" and degrade gracefully to `null`.
 */
export interface GovernancePulseAggsInput {
  readonly rollback_count?: { readonly value?: number | null } | null;
  readonly avg_mttr?: { readonly value?: number | null } | null;
  readonly mttr_percentiles?: {
    readonly values?: {
      readonly ['50.0']?: number | null;
      readonly ['95.0']?: number | null;
    } | null;
  } | null;
  /**
   * Total number of outcome docs in the window. Used together with
   * `rollback_count` to derive the `applied` tile
   * (`applied = outcomes_total - rollback_count`).
   */
  readonly outcomes_total?: { readonly value?: number | null } | null;
  /**
   * B11 — Number of outcome docs in the window with a finite
   * `time_to_detect` value. Volume signal for the MTTD tile; zero means the
   * section is `null` upstream.
   */
  readonly detect_count?: { readonly value?: number | null } | null;
  /**
   * B11 — Arithmetic mean of `time_to_detect` (ms) across the window.
   * Null when ES could not compute it (no matching docs).
   */
  readonly avg_ttd?: { readonly value?: number | null } | null;
  /**
   * B11 — 50th + 95th percentile of `time_to_detect` (ms). Same shape as
   * `mttr_percentiles`.
   */
  readonly ttd_percentiles?: {
    readonly values?: {
      readonly ['50.0']?: number | null;
      readonly ['95.0']?: number | null;
    } | null;
  } | null;
  /**
   * B12 — Outcomes whose corresponding mutation_intent reached `applied`
   * state in the window and stayed there (not rolled back). Each one
   * represents an autonomously-authored detection rule that, in the
   * counterfactual without AutoDEX, an analyst would have authored. Filter
   * agg, so the count lives on `doc_count`.
   */
  readonly rules_authored?: { readonly doc_count?: number | null } | null;
  /**
   * B12 — Outcomes the autonomous pipeline closed without analyst
   * intervention (`pipeline_complete=true` and disposition is auto-
   * resolved or auto-escalated). Each one represents one analyst triage
   * cycle skipped.
   */
  readonly auto_triaged_outcomes?: { readonly doc_count?: number | null } | null;
  /**
   * B12 — Rollbacks that AutoDEX handled itself (`rolled_back=true`,
   * `rollback_source='auto'`). Each one represents one rollback the
   * analyst would otherwise have had to investigate + execute.
   */
  readonly auto_recovered_rollbacks?: { readonly doc_count?: number | null } | null;
  /**
   * B12 — Rollbacks that required human triage (`rolled_back=true`,
   * `rollback_source != 'auto'`). Each one represents analyst time
   * *spent* — subtracted from the hours-saved total.
   */
  readonly human_rollbacks?: { readonly doc_count?: number | null } | null;
}

/**
 * Loose shape of the aggregations block returned by the mutation-intents
 * query. Surfaces the count of intents currently blocked by governance (the
 * blocked tile in the throughput row).
 *
 * All three aggs are `filter` aggregations server-side, which means ES
 * returns the count as `doc_count`. Early versions of this builder read
 * `blocked_count.value` and therefore always rendered "0 blocked", even when
 * `governance_gate.status:"blocked"` rows existed in the window.
 */
export interface MutationIntentsAggsInput {
  readonly blocked_count?: { readonly doc_count?: number | null } | null;
  readonly drift_open?: { readonly doc_count?: number | null } | null;
  readonly drift_resolved?: { readonly doc_count?: number | null } | null;
}

/**
 * Loose shape of the aggregations block returned by the actor-trust-tiers
 * query. Each tier bucket carries a `doc_count` that the tier-mix tile reads.
 */
export interface ActorTrustTiersAggsInput {
  readonly by_actor?: {
    readonly buckets?: ReadonlyArray<{
      readonly key?: string;
      readonly latest?: {
        readonly buckets?: ReadonlyArray<{
          readonly key?: string;
          readonly doc_count?: number;
        }>;
      };
    }>;
  } | null;
  /**
   * Backwards-compatible flat tier aggregation (just a terms bucket on
   * `tier`). Older callers can pass this instead of `by_actor` and the
   * builder will still produce a tier-mix payload.
   */
  readonly tiers?: {
    readonly buckets?: ReadonlyArray<{
      readonly key?: string;
      readonly doc_count?: number;
    }>;
  } | null;
}

export interface BuildGovernancePulseArgs {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly aggs?: GovernancePulseAggsInput | null;
  readonly mutationAggs?: MutationIntentsAggsInput | null;
  readonly trustAggs?: ActorTrustTiersAggsInput | null;
  /**
   * B12 — Override of the per-action minute constants used by the
   * hours-saved proxy. Only the keys provided are applied; missing keys fall
   * back to `DEFAULT_HOURS_SAVED_CONSTANTS`. Operator-supplied overrides
   * travel through the route's `?constants=` query param into this field.
   */
  readonly hoursSavedOverrides?: Partial<HoursSavedConstants> | null;
}

/**
 * Pure builder that turns the raw ES aggregation payloads into the canonical
 * `GovernancePulse` shape the UI reads. Designed so the server route can call
 * it synchronously with up to three ES responses, and tests can exercise every
 * edge case without spinning up a cluster.
 *
 * Degradation rules (per section):
 *   - Missing outcomes aggs             -> `rollback_mttr: null`, `mutation_throughput: null`
 *   - Missing mutation-intent aggs      -> `drift: null`, `mutation_throughput.blocked = 0`
 *   - Missing trust-tier aggs           -> `tier_mix: null`
 *   - Non-finite percentile / avg       -> that specific field becomes `null`
 *
 * The "missing percentile" rule matters because Elasticsearch returns `null`
 * for percentile buckets when there are zero matching docs, and we must not
 * render "NaN ms" in the UI.
 */
export const buildGovernancePulse = ({
  windowStart,
  windowEnd,
  aggs,
  mutationAggs,
  trustAggs,
  hoursSavedOverrides,
}: BuildGovernancePulseArgs): GovernancePulseBuildResult => {
  return {
    window_start: windowStart,
    window_end: windowEnd,
    mttd: buildMttd(aggs),
    hours_saved: buildHoursSaved(aggs, hoursSavedOverrides),
    rollback_mttr: buildMttr(aggs),
    mutation_throughput: buildThroughput(aggs, mutationAggs),
    drift: buildDrift(mutationAggs),
    tier_mix: buildTierMix(trustAggs),
  };
};

/**
 * Resolve the effective constants to use for the hours-saved proxy: defaults
 * with any operator overrides applied. Negative or non-finite override values
 * are silently dropped so a malformed `?constants=` query param can't poison
 * the headline number — the default for that key is used instead.
 *
 * Exported so callers (route handler, tests) can inspect the resolved set
 * before passing it along; the route also stamps the resolved set onto the
 * `applied_constants` field of the response.
 */
export const resolveHoursSavedConstants = (
  overrides?: Partial<HoursSavedConstants> | null
): HoursSavedConstants => {
  const resolved: HoursSavedConstants = { ...DEFAULT_HOURS_SAVED_CONSTANTS };
  if (!overrides) return resolved;

  const apply = (key: keyof HoursSavedConstants) => {
    const candidate = overrides[key];
    if (candidate === undefined || candidate === null) return;
    if (!Number.isFinite(candidate)) return;
    if (candidate < 0) return;
    (resolved as Record<keyof HoursSavedConstants, number>)[key] = candidate;
  };

  apply('minutes_per_authoring');
  apply('minutes_per_triage');
  apply('minutes_per_rollback_recovery');
  apply('minutes_per_human_rollback');
  return resolved;
};

const buildHoursSaved = (
  aggs?: GovernancePulseAggsInput | null,
  overrides?: Partial<HoursSavedConstants> | null
): GovernancePulseHoursSaved | null => {
  if (!aggs) return null;

  const rulesAuthored = toCount(aggs.rules_authored?.doc_count);
  const autoTriaged = toCount(aggs.auto_triaged_outcomes?.doc_count);
  const autoRecovered = toCount(aggs.auto_recovered_rollbacks?.doc_count);
  const humanRollbacks = toCount(aggs.human_rollbacks?.doc_count);

  if (rulesAuthored === 0 && autoTriaged === 0 && autoRecovered === 0 && humanRollbacks === 0) {
    return null;
  }

  const constants = resolveHoursSavedConstants(overrides);
  const authoringHours = (rulesAuthored * constants.minutes_per_authoring) / 60;
  const triageHours = (autoTriaged * constants.minutes_per_triage) / 60;
  const recoveryHours = (autoRecovered * constants.minutes_per_rollback_recovery) / 60;
  // Negative contribution — stored as a negative number so the breakdown
  // sums to `total_hours` arithmetically.
  const humanRollbackHours = -((humanRollbacks * constants.minutes_per_human_rollback) / 60);

  const totalHours = authoringHours + triageHours + recoveryHours + humanRollbackHours;

  return {
    total_hours: roundTo(totalHours, 2),
    breakdown: {
      authoring_hours: roundTo(authoringHours, 2),
      triage_hours: roundTo(triageHours, 2),
      recovery_hours: roundTo(recoveryHours, 2),
      human_rollback_hours: roundTo(humanRollbackHours, 2),
    },
    source_counts: {
      rules_authored: rulesAuthored,
      auto_triaged_outcomes: autoTriaged,
      auto_recovered_rollbacks: autoRecovered,
      human_rollbacks: humanRollbacks,
    },
    applied_constants: constants,
  };
};

/**
 * Coerce a doc_count-shaped agg value to a non-negative integer count.
 * Unlike `toFiniteNumber` (which returns `null`), this returns `0` so the
 * builder can do straightforward arithmetic without null-checks.
 */
const toCount = (value: number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.floor(value);
};

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  // Normalise `-0` → `0`. JS arithmetic produces `-0` whenever a negation
  // hits a zero (e.g. `-(0 * 30 / 60)`) and `-0` !== `0` in deep-equality
  // checks (Jest, jsdom dashboards). The Pulse tile must surface a
  // canonical zero so leadership reads "0 h" not "-0 h".
  return rounded === 0 ? 0 : rounded;
};

const buildMttd = (aggs?: GovernancePulseAggsInput | null): GovernancePulseMttd | null => {
  const detectCount = toFiniteNumber(aggs?.detect_count?.value) ?? 0;
  if (!aggs || detectCount <= 0) return null;

  return {
    detect_count: detectCount,
    avg_ms: toFiniteNumber(aggs.avg_ttd?.value),
    p50_ms: toFiniteNumber(aggs.ttd_percentiles?.values?.['50.0']),
    p95_ms: toFiniteNumber(aggs.ttd_percentiles?.values?.['95.0']),
  };
};

const buildMttr = (aggs?: GovernancePulseAggsInput | null): GovernancePulseMttr | null => {
  const rollbackCount = toFiniteNumber(aggs?.rollback_count?.value) ?? 0;
  if (!aggs || rollbackCount <= 0) return null;

  return {
    rollback_count: rollbackCount,
    avg_ms: toFiniteNumber(aggs.avg_mttr?.value),
    p50_ms: toFiniteNumber(aggs.mttr_percentiles?.values?.['50.0']),
    p95_ms: toFiniteNumber(aggs.mttr_percentiles?.values?.['95.0']),
  };
};

const buildThroughput = (
  outcomesAggs?: GovernancePulseAggsInput | null,
  mutationAggs?: MutationIntentsAggsInput | null
): GovernancePulseThroughput | null => {
  const rolledBack = toFiniteNumber(outcomesAggs?.rollback_count?.value) ?? 0;
  const outcomesTotal = toFiniteNumber(outcomesAggs?.outcomes_total?.value) ?? 0;
  const blocked = toFiniteNumber(mutationAggs?.blocked_count?.doc_count) ?? 0;

  // `applied` is outcomes that were NOT rolled back. Clamp at zero so a
  // data-model drift can't produce negative counts.
  const applied = Math.max(0, outcomesTotal - rolledBack);

  if (outcomesTotal === 0 && blocked === 0) return null;

  return {
    applied,
    rolled_back: rolledBack,
    blocked,
  };
};

const buildDrift = (
  mutationAggs?: MutationIntentsAggsInput | null
): GovernancePulseDrift | null => {
  if (!mutationAggs) return null;
  const openCount = toFiniteNumber(mutationAggs.drift_open?.doc_count) ?? 0;
  const resolvedCount = toFiniteNumber(mutationAggs.drift_resolved?.doc_count) ?? 0;
  if (openCount === 0 && resolvedCount === 0) return null;
  return {
    open_count: openCount,
    resolved_count: resolvedCount,
  };
};

const VALID_TIERS = ['trusted', 'probationary', 'untrusted', 'system'] as const;
type ValidTier = (typeof VALID_TIERS)[number];
const isValidTier = (tier: string | undefined): tier is ValidTier =>
  tier !== undefined && (VALID_TIERS as readonly string[]).includes(tier);

const buildTierMix = (
  trustAggs?: ActorTrustTiersAggsInput | null
): GovernancePulseTierMix | null => {
  if (!trustAggs) return null;

  const tallies: Record<ValidTier, number> = {
    trusted: 0,
    probationary: 0,
    untrusted: 0,
    system: 0,
  };

  // Primary aggregation: a `by_actor` terms bucket containing the most-recent
  // tier per actor (via a sub-aggregation). This dedups actors that moved
  // between tiers so each actor is counted once, in their current tier.
  if (trustAggs.by_actor?.buckets) {
    for (const actorBucket of trustAggs.by_actor.buckets) {
      const tierBucket = actorBucket.latest?.buckets?.[0];
      const tier = tierBucket?.key;
      if (isValidTier(tier)) tallies[tier] += 1;
    }
  } else if (trustAggs.tiers?.buckets) {
    // Fallback: raw tier buckets (counts every tier-assignment row, not
    // deduped by actor). Acceptable when the ES query couldn't afford the
    // sub-agg.
    for (const bucket of trustAggs.tiers.buckets) {
      const tier = bucket.key;
      if (isValidTier(tier)) tallies[tier] += bucket.doc_count ?? 0;
    }
  } else {
    return null;
  }

  const total = tallies.trusted + tallies.probationary + tallies.untrusted + tallies.system;
  if (total === 0) return null;

  return {
    trusted: tallies.trusted,
    probationary: tallies.probationary,
    untrusted: tallies.untrusted,
    system: tallies.system,
    total,
  };
};

const toFiniteNumber = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
};
