/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCoverageGaps, hitToGap } from './coverage_gaps_builder';
import type { RawCoverageHit } from './coverage_gaps_builder';

const WINDOW_START = '2026-03-14T00:00:00.000Z';
const WINDOW_END = '2026-03-15T00:00:00.000Z';

const critical: RawCoverageHit = {
  doc_id: 'g-crit',
  source: {
    '@timestamp': '2026-03-14T10:00:00.000Z',
    technique_id: 'T1059.001',
    technique_name: 'PowerShell',
    occurrences: 120,
    avg_confidence: 0.3,
    source: 'soc-gap-analyzer',
  },
};

const high: RawCoverageHit = {
  doc_id: 'g-high',
  source: {
    '@timestamp': '2026-03-14T10:00:00.000Z',
    technique_id: 'T1078',
    technique_name: 'Valid Accounts',
    occurrences: 30,
    avg_confidence: 0.55,
  },
};

const moderate: RawCoverageHit = {
  doc_id: 'g-mod',
  source: {
    '@timestamp': '2026-03-14T10:00:00.000Z',
    technique_id: 'T1055',
    occurrences: 10,
    avg_confidence: 0.7,
  },
};

const low: RawCoverageHit = {
  doc_id: 'g-low',
  source: {
    '@timestamp': '2026-03-14T10:00:00.000Z',
    technique_id: 'T1070',
    occurrences: 2,
    avg_confidence: 0.95,
  },
};

describe('buildCoverageGaps', () => {
  it('classifies severity correctly from (occurrences, avg_confidence)', () => {
    expect(hitToGap(critical)?.severity).toBe('critical');
    expect(hitToGap(high)?.severity).toBe('high');
    expect(hitToGap(moderate)?.severity).toBe('moderate');
    expect(hitToGap(low)?.severity).toBe('low');
  });

  it('sorts severity-first, then occurrences desc within a bucket', () => {
    const high2: RawCoverageHit = {
      ...high,
      doc_id: 'g-high-2',
      source: { ...high.source, technique_id: 'T1543', occurrences: 80 },
    };
    const result = buildCoverageGaps({
      hits: [low, moderate, high, high2, critical],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });
    expect(result.gaps.map((g) => g.id)).toEqual([
      'g-crit',
      'g-high-2', // higher occurrences within "high"
      'g-high',
      'g-mod',
      'g-low',
    ]);
  });

  it('counts gaps per severity bucket', () => {
    const high2: RawCoverageHit = {
      ...high,
      doc_id: 'g-high-2',
      source: { ...high.source, technique_id: 'T1543' },
    };
    const low2: RawCoverageHit = {
      ...low,
      doc_id: 'g-low-2',
      source: { ...low.source, technique_id: 'T1218' },
    };
    const result = buildCoverageGaps({
      hits: [critical, high, high2, moderate, low, low2],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });
    expect(result.counts).toEqual({
      total: 6,
      critical: 1,
      high: 2,
      moderate: 1,
      low: 2,
    });
  });

  it('dedupes repeated technique_id entries (first-wins after ES sort)', () => {
    const older: RawCoverageHit = {
      doc_id: 'g-old',
      source: {
        '@timestamp': '2026-03-13T08:00:00.000Z',
        technique_id: 'T1041',
        occurrences: 16,
        avg_confidence: 0.52,
      },
    };
    const newer: RawCoverageHit = {
      doc_id: 'g-new',
      source: {
        '@timestamp': '2026-03-14T10:00:00.000Z',
        technique_id: 'T1041',
        occurrences: 16,
        avg_confidence: 0.52,
      },
    };
    // Emulate the ES-side sort (strongest first): `newer` before `older`.
    const result = buildCoverageGaps({
      hits: [newer, older],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].id).toBe('g-new');
    expect(result.counts.total).toBe(1);
  });

  it('defaults missing numeric fields to 0 and keeps the row', () => {
    const hit: RawCoverageHit = {
      doc_id: 'g-sparse',
      source: { technique_id: 'T1001' },
    };
    const gap = hitToGap(hit);
    expect(gap?.occurrences).toBe(0);
    expect(gap?.avg_confidence).toBe(0);
    // 0 occurrences + 0 confidence falls into "low" because neither "hot"
    // nor "very-low-confidence" thresholds trigger.
    expect(gap?.severity).toBe('low');
  });

  it('drops hits without a technique_id', () => {
    const hit: RawCoverageHit = { doc_id: 'x', source: { occurrences: 10 } };
    expect(hitToGap(hit)).toBeNull();
  });

  it('truncates to limit and flags truncated=true', () => {
    const hits = Array.from({ length: 8 }).map<RawCoverageHit>((_, i) => ({
      doc_id: `g-${i}`,
      source: {
        '@timestamp': '2026-03-14T10:00:00.000Z',
        technique_id: `T10${i}`,
        occurrences: i,
        avg_confidence: 0.9,
      },
    }));
    const result = buildCoverageGaps({
      hits,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      limit: 3,
    });
    expect(result.gaps).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });
});
