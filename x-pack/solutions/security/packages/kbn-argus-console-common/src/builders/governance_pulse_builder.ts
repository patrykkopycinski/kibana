/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  GovernanceCoverageSnapshot,
  GovernancePulseBuildResult,
  GovernancePulseCoverageTrend,
  GovernancePulseDrift,
  GovernancePulseHoursSaved,
  GovernancePulseMttd,
  GovernancePulseMttr,
  GovernancePulseSignalToNoise,
  GovernancePulseThroughput,
  GovernancePulseTierMix,
  GovernancePulseTriggerToRule,
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
  /**
   * Vision-doc 1.6.8 — outcomes labelled `verdict: true_positive`
   * (analyst-confirmed) in the window. Filter agg → `doc_count`.
   */
  readonly tp_count?: { readonly doc_count?: number | null } | null;
  /**
   * Vision-doc 1.6.8 — outcomes labelled `verdict: false_positive` in
   * the window. Filter agg → `doc_count`.
   */
  readonly fp_count?: { readonly doc_count?: number | null } | null;
}

/**
 * Loose shape of the aggregations block returned by the mutation-intents
 * lag query (vision-doc 4.1). The route adds these aggs alongside the
 * existing `blocked_count` / `drift_*` filter aggs.
 */
export interface MutationIntentsLagAggsInput {
  /**
   * Number of mutation_intents in the window with a finite
   * `synthesis_lag_ms` value. Volume signal — drives whether the section
   * renders at all.
   */
  readonly lag_count?: { readonly value?: number | null } | null;
  /**
   * Subset of `lag_count` whose `synthesis_lag_ms < 60_000`. The vision-doc
   * 4.1 target compliance count.
   */
  readonly lag_under_60s?: { readonly doc_count?: number | null } | null;
  /** Mean `synthesis_lag_ms` across the window. */
  readonly avg_lag?: { readonly value?: number | null } | null;
  /** 50th + 95th percentiles of `synthesis_lag_ms`. */
  readonly lag_percentiles?: {
    readonly values?: {
      readonly ['50.0']?: number | null;
      readonly ['95.0']?: number | null;
    } | null;
  } | null;
}

/**
 * Loose shape of the `.soc-coverage-snapshots` aggregation. The route runs
 * a `top_hits` agg with `size: 1` sorted by `@timestamp` asc/desc to grab
 * the baseline (oldest) and current (newest) snapshots in the window —
 * the trend is computed in TS.
 */
export interface CoverageSnapshotsAggsInput {
  readonly oldest?: {
    readonly hits?: {
      readonly hits?: ReadonlyArray<{
        readonly _source?: CoverageSnapshotSource | null;
      }>;
    };
  } | null;
  readonly latest?: {
    readonly hits?: {
      readonly hits?: ReadonlyArray<{
        readonly _source?: CoverageSnapshotSource | null;
      }>;
    };
  } | null;
}

/**
 * Loose shape of a `.soc-coverage-snapshots` source document.
 *
 * The numeric fields are typed as `number | string` because the producer
 * (`soc-argus-coverage-snapshotter` workflow) emits them via Liquid, which
 * stringifies all values. The TS-side path that writes the same document
 * (chat-tool / direct API) emits proper numbers. `toCount` /
 * `toFiniteNumber` accept both shapes so the builder stays agnostic.
 */
export interface CoverageSnapshotSource {
  readonly ['@timestamp']?: string | null;
  readonly total_techniques?: number | string | null;
  readonly covered_techniques?: number | string | null;
  readonly coverage_pct?: number | string | null;
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
  /**
   * Vision-doc 4.1 — number of mutation_intents in the window carrying a
   * finite `synthesis_lag_ms` field. `value_count` agg → `value`. Routed
   * alongside the existing throughput aggs because both queries hit the
   * same `.soc-mutation-intents` index.
   */
  readonly lag_count?: { readonly value?: number | null } | null;
  /**
   * Vision-doc 4.1 — subset of `lag_count` whose `synthesis_lag_ms < 60_000`.
   * Filter agg → `doc_count`.
   */
  readonly lag_under_60s?: { readonly doc_count?: number | null } | null;
  /** Mean `synthesis_lag_ms` across the window. */
  readonly avg_lag?: { readonly value?: number | null } | null;
  /** 50th + 95th percentiles of `synthesis_lag_ms`. */
  readonly lag_percentiles?: {
    readonly values?: {
      readonly ['50.0']?: number | null;
      readonly ['95.0']?: number | null;
    } | null;
  } | null;
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
   * Vision-doc 4.2 — `.soc-coverage-snapshots` aggregation payload (oldest +
   * latest snapshot in the window). Optional so cold-start clusters degrade
   * to `coverage_trend: null`.
   */
  readonly coverageSnapshotsAggs?: CoverageSnapshotsAggsInput | null;
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
  coverageSnapshotsAggs,
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
    signal_to_noise: buildSignalToNoise(aggs),
    trigger_to_rule: buildTriggerToRule(mutationAggs),
    coverage_trend: buildCoverageTrend(coverageSnapshotsAggs),
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
/**
 * Coerce a doc_count-shaped agg value to a non-negative integer count.
 *
 * Accepts `number | string | null | undefined` because Liquid-emitted
 * fields (e.g. coverage snapshots written by `soc-argus-coverage-snapshotter`)
 * land as strings on the wire even when the dashboard treats them as
 * counts. `parseFloat` is intentionally lenient — anything that doesn't
 * parse to a finite number degrades to `0` so leadership sees a clean
 * "0" rather than a NaN tile.
 */
const toCount = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  return Math.floor(num);
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

/**
 * Coerce a numeric-ish value to a finite `number` (or `null`).
 *
 * Accepts `number | string | null | undefined` for the same reason
 * `toCount` does — Liquid producers emit numbers as strings.
 */
const toFiniteNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
};

/**
 * Vision-doc 1.6.8 — signal-to-noise tile.
 *
 * Reads `tp_count.doc_count` and `fp_count.doc_count` from the outcomes
 * filter aggs. Returns `null` when both counters are zero (cold start /
 * detection-only environment) so the UI can render "—" rather than a
 * misleading `0%`.
 */
const buildSignalToNoise = (
  aggs?: GovernancePulseAggsInput | null
): GovernancePulseSignalToNoise | null => {
  if (!aggs) return null;
  const confirmed = toCount(aggs.tp_count?.doc_count);
  const falsePositive = toCount(aggs.fp_count?.doc_count);
  const total = confirmed + falsePositive;
  if (total === 0) return null;
  return {
    confirmed,
    false_positive: falsePositive,
    confirmed_ratio: roundTo(confirmed / total, 4),
  };
};

/**
 * Vision-doc 4.1 — trigger-to-rule synthesis lag tile.
 *
 * Reads `lag_count`, `lag_under_60s`, `avg_lag`, `lag_percentiles` from the
 * mutation-intents aggs. Returns `null` when `lag_count === 0` so the UI
 * can render "—" rather than NaN ms.
 *
 * The vision-doc 4.1 metric is "trigger-to-rule creation time < 1 min";
 * `under_one_minute_ratio` is the headline compliance number (1.0 ⇒ every
 * synthesis was sub-minute). p50 / avg / p95 frame the distribution.
 */
const buildTriggerToRule = (
  mutationAggs?: MutationIntentsAggsInput | null
): GovernancePulseTriggerToRule | null => {
  const lagCount = toFiniteNumber(mutationAggs?.lag_count?.value) ?? 0;
  if (!mutationAggs || lagCount <= 0) return null;
  const under60s = toCount(mutationAggs.lag_under_60s?.doc_count);
  return {
    lag_count: lagCount,
    lag_count_under_60s: under60s,
    under_one_minute_ratio: roundTo(under60s / lagCount, 4),
    avg_ms: toFiniteNumber(mutationAggs.avg_lag?.value),
    p50_ms: toFiniteNumber(mutationAggs.lag_percentiles?.values?.['50.0']),
    p95_ms: toFiniteNumber(mutationAggs.lag_percentiles?.values?.['95.0']),
  };
};

/**
 * Vision-doc 4.2 — ATT&CK coverage trend tile.
 *
 * Reads `oldest` and `latest` `top_hits` aggs from `.soc-coverage-snapshots`.
 * Returns `null` when either side is missing — the trend is undefined with
 * fewer than two snapshots in the window. Coverage_pct is two-decimal-rounded
 * (matching the producer workflow output) so the delta_pp is always sensible.
 */
const buildCoverageTrend = (
  aggs?: CoverageSnapshotsAggsInput | null
): GovernancePulseCoverageTrend | null => {
  if (!aggs) return null;
  const baseline = readCoverageSnapshot(aggs.oldest?.hits?.hits?.[0]?._source);
  const current = readCoverageSnapshot(aggs.latest?.hits?.hits?.[0]?._source);
  if (!baseline || !current) return null;
  // If baseline and current point at the same row (window contains one
  // snapshot only) the delta is exactly 0 — still informative ("no change
  // observed") but not a trend signal. Suppress upstream so the tile reads
  // "—" instead of "+0pp".
  if (baseline.snapshot_at === current.snapshot_at) return null;
  return {
    baseline,
    current,
    delta_pp: roundTo(current.coverage_pct - baseline.coverage_pct, 2),
  };
};

const readCoverageSnapshot = (
  source?: CoverageSnapshotSource | null
): GovernanceCoverageSnapshot | null => {
  if (!source) return null;
  const snapshotAt = source['@timestamp'];
  if (typeof snapshotAt !== 'string' || snapshotAt.length === 0) return null;
  const total = toCount(source.total_techniques);
  const covered = toCount(source.covered_techniques);
  if (total === 0) return null;
  // Producer rolls coverage_pct itself (covered/total*100, two decimals).
  // Trust it but defend against drift — recompute when missing or non-finite
  // so a producer regression can't poison the tile.
  const declaredPct = toFiniteNumber(source.coverage_pct);
  const coveragePct =
    declaredPct !== null ? roundTo(declaredPct, 2) : roundTo((covered / total) * 100, 2);
  return {
    snapshot_at: snapshotAt,
    total_techniques: total,
    covered_techniques: Math.min(covered, total),
    coverage_pct: coveragePct,
  };
};
