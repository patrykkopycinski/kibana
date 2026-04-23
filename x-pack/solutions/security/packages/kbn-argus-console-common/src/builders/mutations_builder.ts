/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusMutationFilter,
  ArgusMutationRow,
  ArgusMutationsResponse,
  ArgusMutationVerdict,
} from '../types/mutations';

/**
 * Minimal shape of a raw `.soc-outcomes` source doc that the server handler
 * passes in. We intentionally don't depend on `_source` typings from the ES
 * client here — this builder is isomorphic and tests pass plain objects.
 */
export interface RawOutcomeDoc {
  readonly '@timestamp'?: string | null;
  readonly mutation_intent_id?: string | null;
  readonly rule_id?: string | null;
  readonly rolled_back?: boolean | null;
  readonly rollback_mttr_ms?: number | null;
  /**
   * Explicit "why we rolled back" field. Older outcome docs (pre-field) don't
   * have this — the builder falls back to `subtitle` for those so the UI
   * isn't silent on them.
   */
  readonly rollback_reason?: string | null;
  readonly applied_at?: string | null;
  readonly rolled_back_at?: string | null;
  readonly actor_id?: string | null;
  readonly actor_trust_tier?: string | null;
  readonly title?: string | null;
  readonly label?: string | null;
  readonly subtitle?: string | null;
}

/**
 * Minimal shape of a raw `.soc-mutation-intents` source doc the server hands
 * to the builder. Only the gate-blocked rows are surfaced by the Mutations
 * tab; the rest are already represented via their downstream outcome row.
 */
export interface RawMutationIntentDoc {
  readonly '@timestamp'?: string | null;
  readonly mutation_intent_id?: string | null;
  readonly rule_id?: string | null;
  readonly title?: string | null;
  readonly label?: string | null;
  readonly subtitle?: string | null;
  readonly actor_id?: string | null;
  readonly actor_trust_tier?: string | null;
  readonly governance_gate?: {
    readonly status?: string | null;
    readonly reason?: string | null;
  } | null;
}

export interface BuildMutationsArgs {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly filter: ArgusMutationFilter;
  readonly outcomes: readonly RawOutcomeDoc[];
  readonly blockedIntents: readonly RawMutationIntentDoc[];
  readonly limit: number;
  /**
   * Echoes back to the UI so it can show a "N of M" truncation hint. When
   * omitted we fall back to `rows.length === limit` as the truncation flag.
   */
  readonly totalMatched?: number;
}

/**
 * Pure row-merger for the Mutations tab. Converts two ES result sets
 * (outcomes + blocked intents) into a single time-sorted, verdict-tagged
 * row stream. The server route owns the actual ES queries; this file owns
 * the "what do rows look like" decision so it's testable in isolation.
 */
export const buildMutations = ({
  windowStart,
  windowEnd,
  filter,
  outcomes,
  blockedIntents,
  limit,
  totalMatched,
}: BuildMutationsArgs): ArgusMutationsResponse => {
  const outcomeRows = outcomes.map(outcomeToRow);
  const blockedRows = blockedIntents.map(intentToBlockedRow);

  const counts = {
    applied: outcomeRows.filter((r) => r.verdict === 'applied').length,
    rolled_back: outcomeRows.filter((r) => r.verdict === 'rolled_back').length,
    blocked: blockedRows.length,
  };

  const merged: ArgusMutationRow[] = [...outcomeRows, ...blockedRows]
    .filter((row) => rowMatchesFilter(row, filter))
    // Newest first so the UI shows the most recent activity at the top of
    // the table without the UI having to re-sort. Ties are broken by a
    // deterministic secondary sort on mutation_intent_id + verdict so the
    // output is stable for tests.
    .sort((a, b) => {
      const diff = toMillis(b.timestamp) - toMillis(a.timestamp);
      if (diff !== 0) return diff;
      const ida = a.mutation_intent_id ?? '';
      const idb = b.mutation_intent_id ?? '';
      if (ida !== idb) return ida < idb ? 1 : -1;
      return a.verdict < b.verdict ? 1 : -1;
    });

  const rows = merged.slice(0, Math.max(0, limit));
  const truncated =
    typeof totalMatched === 'number' ? totalMatched > rows.length : merged.length > rows.length;

  return {
    window_start: windowStart,
    window_end: windowEnd,
    filter,
    counts,
    rows,
    truncated,
  };
};

const rowMatchesFilter = (row: ArgusMutationRow, filter: ArgusMutationFilter): boolean => {
  if (filter === 'all') return true;
  return row.verdict === filter;
};

const outcomeToRow = (doc: RawOutcomeDoc): ArgusMutationRow => {
  const verdict: ArgusMutationVerdict = doc.rolled_back === true ? 'rolled_back' : 'applied';
  // Rolled-back rows want a "why". Newer outcome docs carry an explicit
  // `rollback_reason`; older ones only carry `subtitle` (e.g. "investigation
  // +rollback took 309s"). We prefer the explicit reason and fall back to
  // subtitle so pre-field rows still surface *something* instead of "—".
  const rollbackReason =
    verdict === 'rolled_back'
      ? normaliseReason(doc.rollback_reason) ?? normaliseReason(doc.subtitle)
      : null;
  return {
    timestamp: doc['@timestamp'] ?? '',
    verdict,
    mutation_intent_id: doc.mutation_intent_id ?? null,
    rule_id: doc.rule_id ?? null,
    label: doc.label ?? null,
    title: doc.title ?? null,
    subtitle: doc.subtitle ?? null,
    actor_id: doc.actor_id ?? null,
    actor_trust_tier: doc.actor_trust_tier ?? null,
    applied_at: doc.applied_at ?? null,
    rolled_back_at: doc.rolled_back_at ?? null,
    rollback_mttr_ms: toFiniteNumber(doc.rollback_mttr_ms),
    rollback_reason: rollbackReason,
    gate_status: null,
    gate_reason: null,
  };
};

const intentToBlockedRow = (doc: RawMutationIntentDoc): ArgusMutationRow => ({
  timestamp: doc['@timestamp'] ?? '',
  verdict: 'blocked',
  mutation_intent_id: doc.mutation_intent_id ?? null,
  rule_id: doc.rule_id ?? null,
  label: doc.label ?? null,
  title: doc.title ?? null,
  subtitle: doc.subtitle ?? null,
  actor_id: doc.actor_id ?? null,
  actor_trust_tier: doc.actor_trust_tier ?? null,
  applied_at: null,
  rolled_back_at: null,
  rollback_mttr_ms: null,
  rollback_reason: null,
  gate_status: doc.governance_gate?.status ?? 'blocked',
  gate_reason: normaliseReason(doc.governance_gate?.reason),
});

const toMillis = (iso: string): number => {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFiniteNumber = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
};

/**
 * Treats empty strings and whitespace-only strings as "no reason" so the UI
 * can cleanly decide between "show the reason" and "show nothing" without
 * rendering a stray dash.
 */
const normaliseReason = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
