/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DETONATION_STATS_MAX_TREND_BUCKETS } from '../../common/detonate_prototype';
import {
  InvalidRunsQueryError,
  buildRunStatsQuery,
  resolveStatsTime,
  trendIntervalMs,
} from './runs_search';

const DAY_MS = 86_400_000;

describe('trendIntervalMs', () => {
  it('is one day for a range that fits the bucket cap', () => {
    expect(trendIntervalMs(0, 30 * DAY_MS)).toBe(DAY_MS);
    expect(trendIntervalMs(0, 118 * DAY_MS)).toBe(DAY_MS);
  });

  it('widens by whole days once a daily trend would pass the cap', () => {
    expect(trendIntervalMs(0, 119 * DAY_MS)).toBe(2 * DAY_MS);
  });

  it.each([30, 365, 3650, 36500])(
    'never asks for more than the cap over %i days, edge buckets included',
    (days) => {
      const interval = trendIntervalMs(0, days * DAY_MS);
      expect(interval % DAY_MS).toBe(0);
      expect(Math.ceil((days * DAY_MS) / interval) + 2).toBeLessThanOrEqual(
        DETONATION_STATS_MAX_TREND_BUCKETS
      );
    }
  );

  it('is one day for an empty or inverted range', () => {
    expect(trendIntervalMs(5 * DAY_MS, 5 * DAY_MS)).toBe(DAY_MS);
    expect(trendIntervalMs(5 * DAY_MS, 0)).toBe(DAY_MS);
  });
});

describe('resolveStatsTime', () => {
  it('parses an ISO date and date math', () => {
    expect(resolveStatsTime('2026-01-01T00:00:00.000Z', false)).toBe(Date.parse('2026-01-01'));
    const now = Date.now();
    expect(Math.abs(resolveStatsTime('now-1d', false) - (now - DAY_MS))).toBeLessThan(5_000);
  });

  it('rounds a range end up and a range start down', () => {
    expect(resolveStatsTime('2026-01-01T12:00:00.000Z||/d', false)).toBe(Date.parse('2026-01-01'));
    expect(resolveStatsTime('2026-01-01T12:00:00.000Z||/d', true)).toBe(
      Date.parse('2026-01-02') - 1
    );
  });

  it('rejects text that is neither', () => {
    expect(() => resolveStatsTime('yesterday-ish', false)).toThrow(InvalidRunsQueryError);
  });
});

describe('buildRunStatsQuery', () => {
  const range = { from: '2026-01-01T00:00:00.000Z', to: '2026-01-11T00:00:00.000Z' };

  it('pins run documents and the range, and adds the KQL and search between them', () => {
    const { query } = buildRunStatsQuery({ ...range, kql: 'detonate.state: running', search: 'x' });

    const filter = query?.bool?.filter as Array<Record<string, unknown>>;
    expect(filter).toHaveLength(4);
    expect(filter[0]).toEqual({ term: { 'detonate.doc_kind': 'run' } });
    expect(filter[3]).toHaveProperty('range.@timestamp');
  });

  it('counts a run with no verdict as unknown in both the totals and each trend bucket', () => {
    const { aggs } = buildRunStatsQuery(range);

    expect(aggs.verdicts).toEqual(aggs.trend.aggs?.verdicts);
    expect(aggs.verdicts.terms).toEqual(expect.objectContaining({ missing: 'unknown' }));
  });

  it('fills empty days so the trend has no gaps', () => {
    const { aggs } = buildRunStatsQuery(range);

    expect(aggs.trend.date_histogram).toEqual(
      expect.objectContaining({ min_doc_count: 0, extended_bounds: expect.any(Object) })
    );
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => buildRunStatsQuery({ from: range.to, to: range.from })).toThrow(
      InvalidRunsQueryError
    );
  });
});
