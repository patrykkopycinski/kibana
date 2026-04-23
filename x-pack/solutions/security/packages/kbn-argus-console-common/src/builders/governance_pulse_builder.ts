/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  GovernancePulseBuildResult,
  GovernancePulseDrift,
  GovernancePulseMttr,
  GovernancePulseThroughput,
  GovernancePulseTierMix,
} from '../types/governance_pulse';

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
}: BuildGovernancePulseArgs): GovernancePulseBuildResult => {
  return {
    window_start: windowStart,
    window_end: windowEnd,
    rollback_mttr: buildMttr(aggs),
    mutation_throughput: buildThroughput(aggs, mutationAggs),
    drift: buildDrift(mutationAggs),
    tier_mix: buildTierMix(trustAggs),
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
