/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildAutonomyDecisions, hitToDecision } from './autonomy_decisions_builder';
import type { RawAutonomyHit } from './autonomy_decisions_builder';

const WINDOW_START = '2026-03-14T00:00:00.000Z';
const WINDOW_END = '2026-03-15T00:00:00.000Z';

const autoApplied: RawAutonomyHit = {
  doc_id: 'auto-1',
  source: {
    '@timestamp': '2026-03-14T10:00:00.000Z',
    rec_id: 'rec-a',
    artifact_type: 'detection_rule',
    artifact_id: 'rule-7',
    action: 'apply',
    source_agent: 'autonomous-applier',
    gates_evaluated: ['backtest', 'drift', 'kill_switch'],
    gates_passed: ['backtest', 'drift', 'kill_switch'],
    final_status: 'auto_applied',
    auto_applied: true,
    required_human: false,
    trust_tier: 'trusted',
    trust_score: 0.92,
    confidence: 0.81,
  },
};

const requiredHuman: RawAutonomyHit = {
  doc_id: 'req-1',
  source: {
    '@timestamp': '2026-03-14T11:00:00.000Z',
    artifact_id: 'rule-8',
    gates_evaluated: ['backtest', 'drift'],
    gates_passed: ['backtest'],
    first_failing_gate: 'drift',
    final_status: 'REQUIRED_HUMAN',
    required_human: true,
    review_reason: 'drift > threshold',
  },
};

const garbageStatus: RawAutonomyHit = {
  doc_id: 'weird-1',
  source: {
    '@timestamp': '2026-03-14T09:00:00.000Z',
    artifact_id: 'rule-9',
    final_status: 'totally-made-up-value',
  },
};

describe('buildAutonomyDecisions', () => {
  it('maps hits, sorts newest first, counts final_status', () => {
    const result = buildAutonomyDecisions({
      hits: [autoApplied, requiredHuman, garbageStatus],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });

    expect(result.decisions.map((d) => d.id)).toEqual(['req-1', 'auto-1', 'weird-1']);
    expect(result.counts).toEqual({
      total: 3,
      auto_applied: 1,
      deferred: 0,
      required_human: 1,
      rejected: 0,
      rolled_back: 0,
    });
    expect(result.truncated).toBe(false);
    expect(result.window_start).toBe(WINDOW_START);
    expect(result.window_end).toBe(WINDOW_END);
  });

  it('normalises case and coerces unknown final_status to "unknown"', () => {
    const decisions = buildAutonomyDecisions({
      hits: [requiredHuman, garbageStatus],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    }).decisions;

    expect(decisions[0].final_status).toBe('required_human');
    expect(decisions[1].final_status).toBe('unknown');
  });

  it('skips hits without @timestamp or artifact_id', () => {
    const bad: RawAutonomyHit = {
      doc_id: 'no-ts',
      source: { artifact_id: 'x', final_status: 'auto_applied' },
    };
    const bad2: RawAutonomyHit = {
      doc_id: 'no-id',
      source: { '@timestamp': '2026-03-14T00:00:00.000Z', final_status: 'auto_applied' },
    };
    const result = buildAutonomyDecisions({
      hits: [bad, bad2],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });
    expect(result.decisions).toHaveLength(0);
  });

  it('falls back to rec_id when artifact_id is missing', () => {
    const hit: RawAutonomyHit = {
      doc_id: 'fb-1',
      source: {
        '@timestamp': '2026-03-14T12:00:00.000Z',
        rec_id: 'rec-fallback',
        final_status: 'auto_applied',
      },
    };
    const decision = hitToDecision(hit);
    expect(decision?.artifact_id).toBe('rec-fallback');
    expect(decision?.rec_id).toBe('rec-fallback');
  });

  it('truncates to the limit and flags truncated=true', () => {
    const hits = Array.from({ length: 7 }).map<RawAutonomyHit>((_, i) => ({
      doc_id: `h-${i}`,
      source: {
        '@timestamp': `2026-03-14T12:00:0${i}.000Z`,
        artifact_id: `rule-${i}`,
        final_status: 'auto_applied',
      },
    }));
    const result = buildAutonomyDecisions({
      hits,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      limit: 3,
    });
    expect(result.decisions).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('maps the producer-level statuses emitted by soc-autonomous-applier onto UI buckets', () => {
    const now = '2026-04-19T22:00:00.000Z';
    const make = (
      rawStatus: string,
      flags: Partial<RawAutonomyHit['source']> = {}
    ): RawAutonomyHit => ({
      doc_id: `h-${rawStatus}`,
      source: {
        '@timestamp': now,
        artifact_id: `rule-${rawStatus}`,
        final_status: rawStatus,
        ...flags,
      },
    });

    const rows = [
      make('applied', { auto_applied: true }),
      make('clean'),
      make('rolled_back'),
      make('regression_detected'),
      make('rejected_backtest'),
      make('rejected_drift'),
      make('pending_review', { required_human: true }),
      make('pending_backtest'),
      make('auto_apply_ready'),
      make('applying'),
      make('inconclusive'),
      make('totally-made-up-value'),
    ];

    const result = buildAutonomyDecisions({
      hits: rows,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });

    expect(result.counts).toEqual({
      total: 12,
      auto_applied: 2,
      rolled_back: 1,
      rejected: 3,
      required_human: 1,
      deferred: 4,
    });
    // raw_final_status is preserved so the UI can show producer fidelity
    expect(result.decisions.map((d) => d.raw_final_status)).toEqual(
      expect.arrayContaining([
        'applied',
        'regression_detected',
        'rejected_backtest',
        'pending_review',
      ])
    );
  });

  it('honours auto_applied / required_human booleans when status is missing', () => {
    const result = buildAutonomyDecisions({
      hits: [
        {
          doc_id: 'flag-auto',
          source: {
            '@timestamp': '2026-04-19T22:00:00.000Z',
            artifact_id: 'rule-1',
            auto_applied: true,
          },
        },
        {
          doc_id: 'flag-req',
          source: {
            '@timestamp': '2026-04-19T22:00:01.000Z',
            artifact_id: 'rule-2',
            required_human: true,
          },
        },
      ],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });
    expect(result.counts).toMatchObject({ auto_applied: 1, required_human: 1 });
  });

  it('clamps limit to the hard cap and to 1', () => {
    const hits = Array.from({ length: 2 }).map<RawAutonomyHit>((_, i) => ({
      doc_id: `h-${i}`,
      source: {
        '@timestamp': `2026-03-14T12:00:0${i}.000Z`,
        artifact_id: `rule-${i}`,
        final_status: 'auto_applied',
      },
    }));
    // A ridiculous limit should not blow past the hard cap (500) but here we
    // only have 2 hits so truncated should stay false.
    expect(
      buildAutonomyDecisions({
        hits,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        limit: 9999,
      }).truncated
    ).toBe(false);

    // A zero / negative limit should be clamped to 1.
    const clamped = buildAutonomyDecisions({
      hits,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      limit: 0,
    });
    expect(clamped.decisions).toHaveLength(1);
    expect(clamped.truncated).toBe(true);
  });
});
