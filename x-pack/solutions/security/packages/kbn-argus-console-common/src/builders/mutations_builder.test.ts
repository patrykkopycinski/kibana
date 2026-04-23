/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildMutations } from './mutations_builder';
import type { RawMutationIntentDoc, RawOutcomeDoc } from './mutations_builder';

const WINDOW_START = 'now-24h';
const WINDOW_END = 'now';

const appliedDoc: RawOutcomeDoc = {
  '@timestamp': '2026-04-20T18:00:00.000Z',
  mutation_intent_id: 'mut-1',
  rule_id: 'rule-alpha',
  rolled_back: false,
  actor_id: 'argus-orchestrator',
  actor_trust_tier: 'trusted',
  label: 'Canary promoted',
  title: 'Canary promoted: DNS tunneling beacon',
  subtitle: null,
  applied_at: '2026-04-20T17:58:00.000Z',
};

const rolledBackDoc: RawOutcomeDoc = {
  '@timestamp': '2026-04-20T18:05:00.000Z',
  mutation_intent_id: 'mut-2',
  rule_id: 'rule-beta',
  rolled_back: true,
  rollback_mttr_ms: 309_316,
  rollback_reason: 'FP rate exceeded 2σ baseline within 60s of canary promotion',
  actor_id: 'argus-signal-quality-agent',
  actor_trust_tier: 'trusted',
  label: 'Slow rollback',
  title: 'Slow rollback: Office macro triggers remote payload',
  subtitle: 'investigation+rollback took 309s',
  applied_at: '2026-04-20T18:00:00.000Z',
  rolled_back_at: '2026-04-20T18:05:00.000Z',
};

const blockedDoc: RawMutationIntentDoc = {
  '@timestamp': '2026-04-20T18:10:53.000Z',
  mutation_intent_id: 'mut-3',
  rule_id: 'rule-gamma',
  actor_id: 'argus-orchestrator',
  actor_trust_tier: 'trusted',
  label: 'GCP service-account privilege escalation',
  title: 'Mutation intent blocked: GCP service-account privilege escalation',
  subtitle: null,
  governance_gate: {
    status: 'blocked',
    reason: 'Proposing actor trust tier below required floor for IAM-class rules',
  },
};

describe('buildMutations', () => {
  it('counts verdicts across the full set, independent of the applied filter', () => {
    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'applied',
      outcomes: [appliedDoc, rolledBackDoc],
      blockedIntents: [blockedDoc],
      limit: 10,
    });

    expect(result.counts).toEqual({ applied: 1, rolled_back: 1, blocked: 1 });
    // But rows are filtered down to just "applied".
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].verdict).toBe('applied');
  });

  it('tags each outcome row with applied or rolled_back based on the boolean', () => {
    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes: [appliedDoc, rolledBackDoc],
      blockedIntents: [],
      limit: 10,
    });

    const byId = new Map(result.rows.map((r) => [r.mutation_intent_id, r.verdict]));
    expect(byId.get('mut-1')).toBe('applied');
    expect(byId.get('mut-2')).toBe('rolled_back');
  });

  it('lifts governance_gate.status into gate_status for blocked rows only', () => {
    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'blocked',
      outcomes: [appliedDoc],
      blockedIntents: [blockedDoc],
      limit: 10,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      verdict: 'blocked',
      gate_status: 'blocked',
      mutation_intent_id: 'mut-3',
    });
  });

  it('sorts rows newest-first across the merged stream', () => {
    const earlier: RawOutcomeDoc = {
      ...appliedDoc,
      '@timestamp': '2026-04-20T10:00:00.000Z',
      mutation_intent_id: 'mut-old',
    };
    const later: RawOutcomeDoc = {
      ...appliedDoc,
      '@timestamp': '2026-04-20T20:00:00.000Z',
      mutation_intent_id: 'mut-new',
    };

    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes: [earlier, later],
      blockedIntents: [blockedDoc],
      limit: 10,
    });

    expect(result.rows.map((r) => r.mutation_intent_id)).toEqual(['mut-new', 'mut-3', 'mut-old']);
  });

  it('carries rollback_mttr_ms through for rolled_back rows only', () => {
    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes: [appliedDoc, rolledBackDoc],
      blockedIntents: [blockedDoc],
      limit: 10,
    });

    const applied = result.rows.find((r) => r.mutation_intent_id === 'mut-1');
    const rolled = result.rows.find((r) => r.mutation_intent_id === 'mut-2');
    const blocked = result.rows.find((r) => r.mutation_intent_id === 'mut-3');

    expect(applied?.rollback_mttr_ms).toBeNull();
    expect(rolled?.rollback_mttr_ms).toBe(309_316);
    expect(blocked?.rollback_mttr_ms).toBeNull();
  });

  it('surfaces rollback_reason from outcome docs and gate_reason from blocked intents', () => {
    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes: [appliedDoc, rolledBackDoc],
      blockedIntents: [blockedDoc],
      limit: 10,
    });

    const applied = result.rows.find((r) => r.mutation_intent_id === 'mut-1');
    const rolled = result.rows.find((r) => r.mutation_intent_id === 'mut-2');
    const blocked = result.rows.find((r) => r.mutation_intent_id === 'mut-3');

    // Applied rows never carry a "why" — it's only a thing for the
    // off-happy-path verdicts.
    expect(applied?.rollback_reason).toBeNull();
    expect(applied?.gate_reason).toBeNull();

    expect(rolled?.rollback_reason).toBe(
      'FP rate exceeded 2σ baseline within 60s of canary promotion'
    );
    expect(rolled?.gate_reason).toBeNull();

    expect(blocked?.rollback_reason).toBeNull();
    expect(blocked?.gate_reason).toBe(
      'Proposing actor trust tier below required floor for IAM-class rules'
    );
  });

  it('falls back to outcome subtitle when rollback_reason is missing (pre-field docs)', () => {
    // Simulates older `.soc-outcomes` documents written before the explicit
    // rollback_reason field existed — the UI still needs *something* to
    // show, so the builder falls back to subtitle.
    const preField: RawOutcomeDoc = {
      ...rolledBackDoc,
      mutation_intent_id: 'mut-legacy',
      rollback_reason: undefined,
      subtitle: 'investigation+rollback took 309s',
    };

    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'rolled_back',
      outcomes: [preField],
      blockedIntents: [],
      limit: 10,
    });

    expect(result.rows[0].rollback_reason).toBe('investigation+rollback took 309s');
  });

  it('normalises whitespace/empty reason fields to null', () => {
    const blankReason: RawOutcomeDoc = {
      ...rolledBackDoc,
      mutation_intent_id: 'mut-blank',
      rollback_reason: '   ',
      subtitle: null,
    };

    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'rolled_back',
      outcomes: [blankReason],
      blockedIntents: [],
      limit: 10,
    });

    expect(result.rows[0].rollback_reason).toBeNull();
  });

  it('coerces a non-finite mttr (e.g. NaN from a broken pipeline) to null', () => {
    const broken: RawOutcomeDoc = {
      ...rolledBackDoc,
      mutation_intent_id: 'mut-broken',
      rollback_mttr_ms: Number.NaN,
    };

    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'rolled_back',
      outcomes: [broken],
      blockedIntents: [],
      limit: 10,
    });

    expect(result.rows[0].rollback_mttr_ms).toBeNull();
  });

  it('truncates rows at limit and reports truncated=true', () => {
    const outcomes: RawOutcomeDoc[] = Array.from({ length: 5 }, (_, i) => ({
      ...appliedDoc,
      mutation_intent_id: `mut-${i}`,
      '@timestamp': `2026-04-20T18:0${i}:00.000Z`,
    }));

    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes,
      blockedIntents: [],
      limit: 3,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('reports truncated=false when everything fit within limit', () => {
    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes: [appliedDoc],
      blockedIntents: [],
      limit: 10,
    });

    expect(result.truncated).toBe(false);
  });

  it('honours totalMatched for truncation when provided (handles ES cap)', () => {
    // totalMatched models the case where we capped the ES search at `limit`
    // but there are more rows server-side. We should still flag truncated
    // even though rows.length === limit with no excess in-memory.
    const outcomes: RawOutcomeDoc[] = Array.from({ length: 10 }, (_, i) => ({
      ...appliedDoc,
      mutation_intent_id: `mut-${i}`,
      '@timestamp': `2026-04-20T18:0${i}:00.000Z`,
    }));

    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes,
      blockedIntents: [],
      limit: 10,
      totalMatched: 427,
    });

    expect(result.rows).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it('echoes the filter back on the response so the UI can reconcile state', () => {
    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'rolled_back',
      outcomes: [],
      blockedIntents: [],
      limit: 10,
    });

    expect(result.filter).toBe('rolled_back');
    expect(result.rows).toHaveLength(0);
    expect(result.counts).toEqual({ applied: 0, rolled_back: 0, blocked: 0 });
  });

  it('tolerates missing fields on both input shapes without throwing', () => {
    const sparseOutcome = {} as RawOutcomeDoc;
    const sparseIntent = {} as RawMutationIntentDoc;

    const result = buildMutations({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      filter: 'all',
      outcomes: [sparseOutcome],
      blockedIntents: [sparseIntent],
      limit: 10,
    });

    // Sparse outcome -> applied verdict (no rolled_back flag), sparse intent
    // -> blocked with gate_status defaulted to "blocked".
    expect(result.rows).toHaveLength(2);
    expect(result.rows.some((r) => r.verdict === 'applied')).toBe(true);
    expect(result.rows.some((r) => r.verdict === 'blocked' && r.gate_status === 'blocked')).toBe(
      true
    );
  });
});
