/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildGovernancePulse } from './governance_pulse_builder';

const WINDOW_START = '2026-04-20T00:00:00.000Z';
const WINDOW_END = '2026-04-20T12:00:00.000Z';

describe('buildGovernancePulse', () => {
  describe('rollback_mttr', () => {
    it('returns rollback_mttr: null when aggs are missing (cold start)', () => {
      const result = buildGovernancePulse({
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      });

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
});
