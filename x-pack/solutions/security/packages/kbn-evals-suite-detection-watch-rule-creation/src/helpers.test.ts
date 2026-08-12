/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  calculateSetMetrics,
  extractMitreTechniques,
  hasRequiredFields,
  resolveDateMathSeconds,
  validateFromClause,
  validateInterval,
  validateRiskScore,
  validateSeverity,
} from './helpers';

describe('validateFromClause', () => {
  // Negative control for the `broken-fixture-catch-all-query` dataset entry. That fixture exists
  // to prove the quality gate can fail, but the dataset only supplies inputs — nothing in the
  // eval run guarantees the model emits a catch-all. This asserts the property the fixture relies
  // on directly and deterministically: a bare-wildcard FROM scores 0.
  it('rejects the bare wildcard catch-all query', () => {
    expect(validateFromClause('FROM * | LIMIT 1000')).toEqual({
      valid: false,
      error: 'FROM * is not allowed in alerting rules',
    });
  });

  it.each(['FROM *', 'from *  ', 'FROM *|LIMIT 10'])('rejects %p', (query) => {
    expect(validateFromClause(query).valid).toBe(false);
  });

  it.each([
    'FROM logs-endpoint.events.process-* | WHERE host.os.type == "linux"',
    'FROM logs-* | LIMIT 10',
    'FROM .alerts-security.alerts-default',
  ])('accepts scoped index pattern %p', (query) => {
    expect(validateFromClause(query).valid).toBe(true);
  });
});

describe('resolveDateMathSeconds', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('resolves a relative expression against the supplied now', () => {
    expect(resolveDateMathSeconds('now-5m', now)).toBe(now.getTime() / 1000 - 300);
  });

  it('returns null for a non-string', () => {
    expect(resolveDateMathSeconds(undefined, now)).toBeNull();
    expect(resolveDateMathSeconds(5, now)).toBeNull();
  });

  it('returns null for an unparseable expression', () => {
    expect(resolveDateMathSeconds('not-a-date', now)).toBeNull();
  });
});

describe('lookback gap comparison', () => {
  // Regression test for the inverted comparator fixed in this suite's history: `from` and
  // `interval` both resolve to seconds-since-epoch, and a gap exists when `from` is MORE RECENT
  // than now-interval, i.e. fromSec > intervalSec. Getting this backwards silently scores every
  // correctly-configured rule as broken and every broken rule as correct.
  const now = new Date('2026-01-01T00:00:00.000Z');
  const hasGap = (from: string, interval: string) => {
    const fromSec = resolveDateMathSeconds(from, now)!;
    const intervalSec = resolveDateMathSeconds(`now-${interval}`, now)!;
    return fromSec > intervalSec;
  };

  it('reports no gap when lookback reaches further back than the interval', () => {
    expect(hasGap('now-10m', '5m')).toBe(false);
  });

  it('reports a gap when lookback is shorter than the interval', () => {
    expect(hasGap('now-1m', '5m')).toBe(true);
  });

  it('reports no gap when lookback exactly equals the interval', () => {
    expect(hasGap('now-5m', '5m')).toBe(false);
  });
});

describe('calculateSetMetrics', () => {
  it('scores a perfect match', () => {
    expect(calculateSetMetrics(new Set(['T1078']), new Set(['T1078']))).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it('treats two empty sets as a match', () => {
    expect(calculateSetMetrics(new Set(), new Set())).toEqual({ precision: 1, recall: 1, f1: 1 });
  });

  it('scores zero when only one side is empty', () => {
    expect(calculateSetMetrics(new Set(['T1078']), new Set())).toEqual({
      precision: 0,
      recall: 0,
      f1: 0,
    });
  });

  it('computes partial precision and recall', () => {
    const metrics = calculateSetMetrics(
      new Set(['T1078', 'T1110']),
      new Set(['T1078', 'T1059', 'T1105'])
    );
    expect(metrics.precision).toBeCloseTo(0.5);
    expect(metrics.recall).toBeCloseTo(1 / 3);
    expect(metrics.f1).toBeCloseTo(0.4);
  });
});

describe('validateInterval', () => {
  it.each(['5m', '30s', '1h', '7d'])('accepts %p', (interval) => {
    expect(validateInterval(interval)).toBe(true);
  });

  it.each(['5', 'm', '5 m', '5min', '-5m', '', 5, undefined])('rejects %p', (interval) => {
    expect(validateInterval(interval)).toBe(false);
  });
});

describe('validateSeverity', () => {
  it.each(['low', 'medium', 'high', 'critical'])('accepts %p', (severity) => {
    expect(validateSeverity(severity)).toBe(true);
  });

  it.each(['Low', 'severe', '', null, undefined, 3])('rejects %p', (severity) => {
    expect(validateSeverity(severity)).toBe(false);
  });
});

describe('validateRiskScore', () => {
  it.each([0, 50, 100])('accepts %p', (score) => {
    expect(validateRiskScore(score)).toBe(true);
  });

  it.each([-1, 101, '50', null, undefined])('rejects %p', (score) => {
    expect(validateRiskScore(score)).toBe(false);
  });
});

describe('hasRequiredFields', () => {
  const complete = {
    name: 'Rule',
    description: 'Desc',
    query: 'FROM logs-*',
    severity: 'high' as const,
    tags: ['a'],
    risk_score: 50,
  };

  it('reports full coverage for a complete rule', () => {
    expect(hasRequiredFields(complete)).toEqual({ hasAll: true, coverage: 1, missing: [] });
  });

  it('treats empty strings and empty arrays as absent, not present', () => {
    const result = hasRequiredFields({ ...complete, description: '', tags: [] });
    expect(result.hasAll).toBe(false);
    expect(result.missing).toEqual(['description', 'tags']);
    expect(result.coverage).toBeCloseTo(4 / 6);
  });

  it('reports zero coverage for an empty rule', () => {
    expect(hasRequiredFields({})).toMatchObject({ hasAll: false, coverage: 0 });
  });
});

describe('extractMitreTechniques', () => {
  it('collects technique and subtechnique ids', () => {
    const techniques = extractMitreTechniques({
      threat: [
        {
          technique: [{ id: 'T1078', name: 'Valid Accounts', subtechnique: [{ id: 'T1078.001' }] }],
        },
      ],
    });
    expect(techniques).toEqual(new Set(['T1078', 'T1078.001']));
  });

  it('returns an empty set when threat is absent', () => {
    expect(extractMitreTechniques({})).toEqual(new Set());
  });
});
