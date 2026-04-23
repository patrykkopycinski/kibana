/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCalderaQueue } from './caldera_queue_builder';
import type {
  RawCalderaCommandDoc,
  RawCalderaProfileDoc,
  RawDifficultyStateDoc,
} from './caldera_queue_builder';

const mkCmd = (
  overrides: Partial<RawCalderaCommandDoc> & { docId: string }
): { readonly doc_id: string; readonly source: RawCalderaCommandDoc } => ({
  doc_id: overrides.docId,
  source: {
    '@timestamp': '2026-03-14T12:00:00.000Z',
    status: 'pending',
    difficulty: 1,
    profile: 'opportunistic-smash-and-grab',
    techniques: ['T1059'],
    ...overrides,
  },
});

const mkProfile = (
  overrides: Partial<RawCalderaProfileDoc> & { docId: string }
): { readonly doc_id: string; readonly source: RawCalderaProfileDoc } => ({
  doc_id: overrides.docId,
  source: {
    difficulty_level: 1,
    name: 'opportunistic-smash-and-grab',
    adversary_id: 'caldera-adv-1',
    techniques: ['T1059'],
    ...overrides,
  },
});

const difficulty: RawDifficultyStateDoc = {
  '@timestamp': '2026-03-14T12:00:00.000Z',
  current_level: 3,
  level_name: 'operational-patience',
  detection_rate_pct: 62.5,
  fp_rate_pct: 1.2,
  trusted_agent_count: 4,
  decision: 'promote',
  reasoning: '3 consecutive green windows',
};

describe('buildCalderaQueue', () => {
  it('maps commands, sorts newest first, counts status', () => {
    const result = buildCalderaQueue({
      commandHits: [
        mkCmd({ docId: 'c1', '@timestamp': '2026-03-14T10:00:00.000Z', status: 'pending' }),
        mkCmd({ docId: 'c2', '@timestamp': '2026-03-14T11:00:00.000Z', status: 'running' }),
        mkCmd({ docId: 'c3', '@timestamp': '2026-03-14T09:00:00.000Z', status: 'completed' }),
        mkCmd({ docId: 'c4', '@timestamp': '2026-03-14T12:00:00.000Z', status: 'failed' }),
      ],
      profileHits: [],
    });
    expect(result.commands.map((c) => c.id)).toEqual(['c4', 'c2', 'c1', 'c3']);
    expect(result.counts).toEqual({
      pending: 1,
      claimed: 0,
      running: 1,
      completed: 1,
      failed: 1,
      total: 4,
    });
  });

  it('coerces unknown status to "unknown" without counting it', () => {
    const result = buildCalderaQueue({
      commandHits: [mkCmd({ docId: 'c1', status: 'banana' })],
      profileHits: [],
    });
    expect(result.commands[0].status).toBe('unknown');
    expect(result.counts).toEqual({
      pending: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
      total: 1,
    });
  });

  it('sorts profiles by difficulty_level ascending', () => {
    const result = buildCalderaQueue({
      commandHits: [],
      profileHits: [
        mkProfile({ docId: 'p3', difficulty_level: 3, name: 'lvl3' }),
        mkProfile({ docId: 'p1', difficulty_level: 1, name: 'lvl1' }),
        mkProfile({ docId: 'p2', difficulty_level: 2, name: 'lvl2' }),
      ],
    });
    expect(result.profiles.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('drops commands missing @timestamp and profiles missing name/level', () => {
    const result = buildCalderaQueue({
      commandHits: [mkCmd({ docId: 'good' }), { doc_id: 'bad', source: { status: 'pending' } }],
      profileHits: [
        mkProfile({ docId: 'pg' }),
        { doc_id: 'pbad1', source: { difficulty_level: 1 } },
        { doc_id: 'pbad2', source: { name: 'no-level' } },
      ],
    });
    expect(result.commands.map((c) => c.id)).toEqual(['good']);
    expect(result.profiles.map((p) => p.id)).toEqual(['pg']);
  });

  it('passes through difficulty_state when provided', () => {
    const result = buildCalderaQueue({
      commandHits: [],
      profileHits: [],
      difficultyStateDoc: difficulty,
    });
    expect(result.difficulty_state?.current_level).toBe(3);
    expect(result.difficulty_state?.decision).toBe('promote');
  });

  it('omits difficulty_state when not provided', () => {
    const result = buildCalderaQueue({ commandHits: [], profileHits: [] });
    expect(result.difficulty_state).toBeUndefined();
  });

  it('propagates decision_reason on difficulty_state', () => {
    const result = buildCalderaQueue({
      commandHits: [],
      profileHits: [],
      difficultyStateDoc: {
        ...difficulty,
        decision: 'maintain',
        decision_reason: 'trust_stale',
      },
      nowMs: Date.parse('2026-03-14T12:00:00.000Z'),
    });
    expect(result.difficulty_state?.decision_reason).toBe('trust_stale');
    expect(result.difficulty_state?.decision).toBe('maintain');
  });

  it('derives age_seconds and flags stale=false for a fresh tick', () => {
    const result = buildCalderaQueue({
      commandHits: [],
      profileHits: [],
      difficultyStateDoc: {
        ...difficulty,
        '@timestamp': '2026-03-14T12:00:00.000Z',
      },
      nowMs: Date.parse('2026-03-14T12:05:00.000Z'), // 5 min later
    });
    expect(result.difficulty_state?.age_seconds).toBe(300);
    expect(result.difficulty_state?.stale).toBe(false);
  });

  it('flags stale=true once age exceeds 30 minutes (2× controller cadence)', () => {
    const result = buildCalderaQueue({
      commandHits: [],
      profileHits: [],
      difficultyStateDoc: {
        ...difficulty,
        '@timestamp': '2026-03-14T12:00:00.000Z',
      },
      nowMs: Date.parse('2026-03-14T12:31:00.000Z'), // 31 min later
    });
    expect(result.difficulty_state?.age_seconds).toBe(1860);
    expect(result.difficulty_state?.stale).toBe(true);
  });

  it('clamps negative age (clock skew) to 0 and treats as fresh', () => {
    const result = buildCalderaQueue({
      commandHits: [],
      profileHits: [],
      difficultyStateDoc: {
        ...difficulty,
        '@timestamp': '2026-03-14T12:10:00.000Z', // future relative to nowMs
      },
      nowMs: Date.parse('2026-03-14T12:00:00.000Z'),
    });
    expect(result.difficulty_state?.age_seconds).toBe(0);
    expect(result.difficulty_state?.stale).toBe(false);
  });

  it('returns undefined age_seconds when @timestamp is missing or unparseable', () => {
    const result = buildCalderaQueue({
      commandHits: [],
      profileHits: [],
      difficultyStateDoc: {
        ...difficulty,
        '@timestamp': 'not-a-date',
      },
      nowMs: Date.parse('2026-03-14T12:00:00.000Z'),
    });
    expect(result.difficulty_state?.age_seconds).toBeUndefined();
    expect(result.difficulty_state?.stale).toBe(false);
  });

  it('parses techniques_executed concatenated-string form (real producer shape)', () => {
    const result = buildCalderaQueue({
      commandHits: [
        mkCmd({
          docId: 'c-concat',
          techniques_executed: 'T1033T1059.004T1496',
          caldera_adversary_id: 'soc-sim-script-kiddie',
          caldera_state: 'cleanup',
          dispatched_at: '2026-04-19T22:21:56Z',
          difficulty: '1',
        }),
      ],
      profileHits: [],
    });
    const [cmd] = result.commands;
    expect(cmd.techniques_executed).toEqual(['T1033', 'T1059.004', 'T1496']);
    expect(cmd.caldera_adversary_id).toBe('soc-sim-script-kiddie');
    expect(cmd.caldera_state).toBe('cleanup');
    expect(cmd.dispatched_at).toBe('2026-04-19T22:21:56Z');
    // difficulty arrives as the string "1" — still coerces to a number
    expect(cmd.difficulty).toBe(1);
  });

  it('accepts techniques_executed as an array form too', () => {
    const result = buildCalderaQueue({
      commandHits: [mkCmd({ docId: 'c-arr', techniques_executed: ['T1059', 'T1496'] })],
      profileHits: [],
    });
    expect(result.commands[0].techniques_executed).toEqual(['T1059', 'T1496']);
  });

  it('truncates commands to the limit and flags truncated=true', () => {
    const hits = Array.from({ length: 6 }).map((_, i) =>
      mkCmd({ docId: `c-${i}`, '@timestamp': `2026-03-14T12:00:0${i}.000Z` })
    );
    const result = buildCalderaQueue({ commandHits: hits, profileHits: [], limit: 2 });
    expect(result.commands).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});
