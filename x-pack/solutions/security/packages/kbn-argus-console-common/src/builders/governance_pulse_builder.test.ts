/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DEFAULT_HOURS_SAVED_CONSTANTS,
  buildGovernancePulse,
  resolveHoursSavedConstants,
} from './governance_pulse_builder';

const WINDOW_START = '2026-04-20T00:00:00.000Z';
const WINDOW_END = '2026-04-20T12:00:00.000Z';

describe('buildGovernancePulse', () => {
  describe('rollback_mttr', () => {
    it('returns rollback_mttr: null when aggs are missing (cold start)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      });

      expect(result.mttd).toBeNull();
      expect(result.rollback_mttr).toBeNull();
      expect(result.mutation_throughput).toBeNull();
      expect(result.drift).toBeNull();
      expect(result.tier_mix).toBeNull();
    });

    it('returns rollback_mttr: null when no rollback outcomes in the window', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 0 },
          avg_mttr: { value: null },
          mttr_percentiles: { values: { '50.0': null, '95.0': null } },
        },
      });

      expect(result.rollback_mttr).toBeNull();
    });

    it('carries window bounds verbatim so the UI can label the tile', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 3 },
          avg_mttr: { value: 12000 },
          mttr_percentiles: { values: { '50.0': 9000, '95.0': 42000 } },
        },
      });

      expect(result.window_start).toBe(WINDOW_START);
      expect(result.window_end).toBe(WINDOW_END);
    });

    it('surfaces count, avg, p50, p95 when rollbacks exist', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 5 },
          avg_mttr: { value: 15432 },
          mttr_percentiles: { values: { '50.0': 9800, '95.0': 58000 } },
        },
      });

      expect(result.rollback_mttr).toEqual({
        rollback_count: 5,
        avg_ms: 15432,
        p50_ms: 9800,
        p95_ms: 58000,
      });
    });

    it('coerces non-finite avg / percentiles to null without nuking the tile', () => {
      // ES returns NaN-ish values sometimes when percentile calculation fails on
      // a single-doc bucket. We must degrade gracefully — a count-only tile is
      // still useful, "NaN ms" is not.
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 2 },
          avg_mttr: { value: Number.NaN },
          mttr_percentiles: { values: { '50.0': Number.POSITIVE_INFINITY, '95.0': 1234 } },
        },
      });

      expect(result.rollback_mttr).toEqual({
        rollback_count: 2,
        avg_ms: null,
        p50_ms: null,
        p95_ms: 1234,
      });
    });

    it('treats missing percentile sub-keys as null, not undefined', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 1 },
          avg_mttr: { value: 7000 },
          mttr_percentiles: { values: undefined },
        },
      });

      expect(result.rollback_mttr).toEqual({
        rollback_count: 1,
        avg_ms: 7000,
        p50_ms: null,
        p95_ms: null,
      });
    });
  });

  describe('mttd (B11)', () => {
    it('returns null when no detect_count agg is present (cold start)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 0 },
        },
      });

      expect(result.mttd).toBeNull();
    });

    it('returns null when detect_count is zero', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          detect_count: { value: 0 },
          avg_ttd: { value: null },
          ttd_percentiles: { values: { '50.0': null, '95.0': null } },
        },
      });

      expect(result.mttd).toBeNull();
    });

    it('surfaces count, avg, p50, p95 when detection outcomes exist', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          detect_count: { value: 8 },
          avg_ttd: { value: 25_500 },
          ttd_percentiles: { values: { '50.0': 18_000, '95.0': 67_500 } },
        },
      });

      expect(result.mttd).toEqual({
        detect_count: 8,
        avg_ms: 25_500,
        p50_ms: 18_000,
        p95_ms: 67_500,
      });
    });

    it('coerces non-finite avg / percentiles to null without nuking the tile', () => {
      // Same defensive shape as rollback_mttr — we never want "NaN ms" in the
      // UI even when ES degrades a single-doc bucket.
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          detect_count: { value: 1 },
          avg_ttd: { value: Number.NaN },
          ttd_percentiles: { values: { '50.0': Number.NEGATIVE_INFINITY, '95.0': 12_345 } },
        },
      });

      expect(result.mttd).toEqual({
        detect_count: 1,
        avg_ms: null,
        p50_ms: null,
        p95_ms: 12_345,
      });
    });

    it('treats missing percentile sub-keys as null, not undefined', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          detect_count: { value: 2 },
          avg_ttd: { value: 9_000 },
          ttd_percentiles: { values: undefined },
        },
      });

      expect(result.mttd).toEqual({
        detect_count: 2,
        avg_ms: 9_000,
        p50_ms: null,
        p95_ms: null,
      });
    });

    it('is independent of rollback_mttr — both can populate together', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 3 },
          avg_mttr: { value: 12_000 },
          mttr_percentiles: { values: { '50.0': 9_000, '95.0': 42_000 } },
          detect_count: { value: 4 },
          avg_ttd: { value: 22_000 },
          ttd_percentiles: { values: { '50.0': 18_000, '95.0': 50_000 } },
        },
      });

      expect(result.rollback_mttr).not.toBeNull();
      expect(result.mttd).not.toBeNull();
      expect(result.mttd?.detect_count).toBe(4);
      expect(result.rollback_mttr?.rollback_count).toBe(3);
    });

    it('populates mttd even when rollback_mttr is null (detection-only cluster)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 0 },
          detect_count: { value: 5 },
          avg_ttd: { value: 30_000 },
          ttd_percentiles: { values: { '50.0': 25_000, '95.0': 80_000 } },
        },
      });

      expect(result.rollback_mttr).toBeNull();
      expect(result.mttd?.detect_count).toBe(5);
    });
  });

  describe('mutation_throughput', () => {
    it('splits outcomes_total into applied + rolled_back, and carries blocked', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 3 },
          outcomes_total: { value: 10 },
        },
        mutationAggs: {
          blocked_count: { doc_count: 2 },
        },
      });

      expect(result.mutation_throughput).toEqual({
        applied: 7,
        rolled_back: 3,
        blocked: 2,
      });
    });

    it('returns null when there is no outcome and no blocked intent activity', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 0 },
          outcomes_total: { value: 0 },
        },
        mutationAggs: {
          blocked_count: { doc_count: 0 },
        },
      });

      expect(result.mutation_throughput).toBeNull();
    });

    it('clamps applied at zero if rollback_count exceeds outcomes_total (drift)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rollback_count: { value: 5 },
          outcomes_total: { value: 2 },
        },
        mutationAggs: {
          blocked_count: { doc_count: 0 },
        },
      });

      expect(result.mutation_throughput?.applied).toBe(0);
    });

    it('renders a blocked-only tile when no outcomes but governance blocks exist', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        mutationAggs: {
          blocked_count: { doc_count: 4 },
        },
      });

      expect(result.mutation_throughput).toEqual({
        applied: 0,
        rolled_back: 0,
        blocked: 4,
      });
    });
  });

  describe('drift', () => {
    it('returns open + resolved counts when drift activity exists', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        mutationAggs: {
          drift_open: { doc_count: 3 },
          drift_resolved: { doc_count: 2 },
        },
      });

      expect(result.drift).toEqual({ open_count: 3, resolved_count: 2 });
    });

    it('returns null when both drift counts are zero', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        mutationAggs: {
          drift_open: { doc_count: 0 },
          drift_resolved: { doc_count: 0 },
        },
      });

      expect(result.drift).toBeNull();
    });

    it('returns null when mutation aggs are absent entirely', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      });

      expect(result.drift).toBeNull();
    });
  });

  describe('tier_mix', () => {
    it('dedups by actor via the by_actor sub-agg (most-recent tier wins)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        trustAggs: {
          by_actor: {
            buckets: [
              { key: 'actor-a', latest: { buckets: [{ key: 'trusted', doc_count: 1 }] } },
              { key: 'actor-b', latest: { buckets: [{ key: 'probationary', doc_count: 1 }] } },
              { key: 'actor-c', latest: { buckets: [{ key: 'trusted', doc_count: 1 }] } },
              { key: 'actor-d', latest: { buckets: [{ key: 'system', doc_count: 1 }] } },
            ],
          },
        },
      });

      expect(result.tier_mix).toEqual({
        trusted: 2,
        probationary: 1,
        untrusted: 0,
        system: 1,
        total: 4,
      });
    });

    it('ignores unrecognised tier strings instead of crashing', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        trustAggs: {
          by_actor: {
            buckets: [
              { key: 'actor-a', latest: { buckets: [{ key: 'trusted', doc_count: 1 }] } },
              { key: 'actor-b', latest: { buckets: [{ key: 'bogus-tier', doc_count: 1 }] } },
            ],
          },
        },
      });

      expect(result.tier_mix).toEqual({
        trusted: 1,
        probationary: 0,
        untrusted: 0,
        system: 0,
        total: 1,
      });
    });

    it('falls back to the flat tiers bucket when by_actor is absent', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        trustAggs: {
          tiers: {
            buckets: [
              { key: 'trusted', doc_count: 3 },
              { key: 'probationary', doc_count: 2 },
              { key: 'untrusted', doc_count: 1 },
              { key: 'system', doc_count: 1 },
            ],
          },
        },
      });

      expect(result.tier_mix).toEqual({
        trusted: 3,
        probationary: 2,
        untrusted: 1,
        system: 1,
        total: 7,
      });
    });

    it('returns null when every tier tally is zero', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        trustAggs: {
          by_actor: { buckets: [] },
        },
      });

      expect(result.tier_mix).toBeNull();
    });
  });

  describe('hours_saved (B12)', () => {
    it('returns null when no source counts are present (cold start)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      });

      expect(result.hours_saved).toBeNull();
    });

    it('returns null when every source count is zero', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 0 },
          auto_triaged_outcomes: { doc_count: 0 },
          auto_recovered_rollbacks: { doc_count: 0 },
          human_rollbacks: { doc_count: 0 },
        },
      });

      expect(result.hours_saved).toBeNull();
    });

    it('computes total + breakdown using default constants', () => {
      // 4 rules × 90 min = 360 min = 6 h authoring
      // 60 alerts × 5 min = 300 min = 5 h triage
      // 4 rollbacks × 15 min = 60 min = 1 h auto-recovery
      // 0 human rollbacks → 0 h cost
      // total = 6 + 5 + 1 - 0 = 12 h
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 4 },
          auto_triaged_outcomes: { doc_count: 60 },
          auto_recovered_rollbacks: { doc_count: 4 },
          human_rollbacks: { doc_count: 0 },
        },
      });

      expect(result.hours_saved).toEqual({
        total_hours: 12,
        breakdown: {
          authoring_hours: 6,
          triage_hours: 5,
          recovery_hours: 1,
          human_rollback_hours: 0,
        },
        source_counts: {
          rules_authored: 4,
          auto_triaged_outcomes: 60,
          auto_recovered_rollbacks: 4,
          human_rollbacks: 0,
        },
        applied_constants: DEFAULT_HOURS_SAVED_CONSTANTS,
      });
    });

    it('subtracts human-rollback cost from the total (negative contribution surfaces)', () => {
      // 0 + 0 + 0 - (4 × 30) / 60 = -2 h. Total stays negative — surfaces the
      // failure mode AutoDEX governance exists to prevent.
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 0 },
          auto_triaged_outcomes: { doc_count: 0 },
          auto_recovered_rollbacks: { doc_count: 0 },
          human_rollbacks: { doc_count: 4 },
        },
      });

      expect(result.hours_saved?.total_hours).toBe(-2);
      expect(result.hours_saved?.breakdown.human_rollback_hours).toBe(-2);
    });

    it('keeps the section populated when only one source count is non-zero', () => {
      // Edge case the RFC calls out: the breakdown surfaces every contribution
      // even when most are zero, so the UI shows "0 h triage" rather than
      // hiding the row.
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 1 },
          auto_triaged_outcomes: { doc_count: 0 },
          auto_recovered_rollbacks: { doc_count: 0 },
          human_rollbacks: { doc_count: 0 },
        },
      });

      expect(result.hours_saved).not.toBeNull();
      expect(result.hours_saved?.total_hours).toBe(1.5);
      expect(result.hours_saved?.breakdown).toEqual({
        authoring_hours: 1.5,
        triage_hours: 0,
        recovery_hours: 0,
        human_rollback_hours: 0,
      });
    });

    it('rounds total + breakdown values to 2 decimals (no jittery dashboards)', () => {
      // 1 alert × 5 min = 5 min = 0.0833... h → rounds to 0.08
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 0 },
          auto_triaged_outcomes: { doc_count: 1 },
          auto_recovered_rollbacks: { doc_count: 0 },
          human_rollbacks: { doc_count: 0 },
        },
      });

      expect(result.hours_saved?.total_hours).toBe(0.08);
      expect(result.hours_saved?.breakdown.triage_hours).toBe(0.08);
    });

    it('honours operator overrides via hoursSavedOverrides', () => {
      // Override authoring to 30 min; everything else falls back to defaults.
      // 4 rules × 30 min = 120 min = 2 h authoring (instead of 6 h).
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 4 },
          auto_triaged_outcomes: { doc_count: 0 },
          auto_recovered_rollbacks: { doc_count: 0 },
          human_rollbacks: { doc_count: 0 },
        },
        hoursSavedOverrides: { minutes_per_authoring: 30 },
      });

      expect(result.hours_saved?.total_hours).toBe(2);
      expect(result.hours_saved?.breakdown.authoring_hours).toBe(2);
      expect(result.hours_saved?.applied_constants).toEqual({
        ...DEFAULT_HOURS_SAVED_CONSTANTS,
        minutes_per_authoring: 30,
      });
    });

    it('drops malformed override values and uses defaults instead', () => {
      // Negative + non-finite + null override values must not poison the
      // headline — silently fall back to the default for that key.
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 1 },
          auto_triaged_outcomes: { doc_count: 0 },
          auto_recovered_rollbacks: { doc_count: 0 },
          human_rollbacks: { doc_count: 0 },
        },
        hoursSavedOverrides: {
          minutes_per_authoring: -10,
          minutes_per_triage: Number.NaN,
          minutes_per_rollback_recovery: null as unknown as number,
        },
      });

      expect(result.hours_saved?.applied_constants).toEqual(DEFAULT_HOURS_SAVED_CONSTANTS);
    });

    it('coerces non-finite or negative doc_count values to zero', () => {
      // Defensive against a corrupted aggregation — a negative or NaN
      // doc_count must not blow up the math.
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: -5 },
          auto_triaged_outcomes: { doc_count: Number.NaN },
          auto_recovered_rollbacks: { doc_count: 2 },
          human_rollbacks: { doc_count: 0 },
        },
      });

      expect(result.hours_saved?.source_counts).toEqual({
        rules_authored: 0,
        auto_triaged_outcomes: 0,
        auto_recovered_rollbacks: 2,
        human_rollbacks: 0,
      });
      expect(result.hours_saved?.total_hours).toBe(0.5);
    });

    it('floors fractional doc_count values (counts are integers)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        aggs: {
          rules_authored: { doc_count: 4.7 },
          auto_triaged_outcomes: { doc_count: 0 },
          auto_recovered_rollbacks: { doc_count: 0 },
          human_rollbacks: { doc_count: 0 },
        },
      });

      expect(result.hours_saved?.source_counts.rules_authored).toBe(4);
    });
  });
});

describe('resolveHoursSavedConstants', () => {
  it('returns defaults when overrides are not provided', () => {
    expect(resolveHoursSavedConstants()).toEqual(DEFAULT_HOURS_SAVED_CONSTANTS);
    expect(resolveHoursSavedConstants(null)).toEqual(DEFAULT_HOURS_SAVED_CONSTANTS);
    expect(resolveHoursSavedConstants({})).toEqual(DEFAULT_HOURS_SAVED_CONSTANTS);
  });

  it('applies provided overrides on top of defaults', () => {
    const result = resolveHoursSavedConstants({
      minutes_per_authoring: 60,
      minutes_per_triage: 3,
    });
    expect(result).toEqual({
      ...DEFAULT_HOURS_SAVED_CONSTANTS,
      minutes_per_authoring: 60,
      minutes_per_triage: 3,
    });
  });

  it('drops negative override values', () => {
    const result = resolveHoursSavedConstants({ minutes_per_authoring: -1 });
    expect(result.minutes_per_authoring).toBe(DEFAULT_HOURS_SAVED_CONSTANTS.minutes_per_authoring);
  });

  it('drops non-finite override values', () => {
    const result = resolveHoursSavedConstants({
      minutes_per_authoring: Number.POSITIVE_INFINITY,
      minutes_per_triage: Number.NaN,
    });
    expect(result).toEqual(DEFAULT_HOURS_SAVED_CONSTANTS);
  });

  it('accepts zero as a valid override (no time saved per action)', () => {
    // Zero is a defensible override — "we don't credit triage savings" — and
    // must not be confused with "missing key, fall back to default".
    const result = resolveHoursSavedConstants({ minutes_per_triage: 0 });
    expect(result.minutes_per_triage).toBe(0);
  });
});
