/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  TUNING_BASE_RULES,
  buildTpCohort,
  buildTuningVariantMatrix,
  fpHostFor,
  fpUserFor,
  reshapesEntities,
} from './tuning_variants';

describe('buildTuningVariantMatrix', () => {
  const matrix = buildTuningVariantMatrix();

  it('expands 10 base rules x 3 variants into 30 unique cases', () => {
    expect(TUNING_BASE_RULES).toHaveLength(10);
    expect(matrix).toHaveLength(30);
    expect(new Set(matrix.map((m) => m.caseId)).size).toBe(30);
  });

  it('uses the case id <base>-v<n>', () => {
    expect(matrix.find((m) => m.caseId === 'fp-host-exception-v1')?.baseId).toBe(
      'fp-host-exception'
    );
  });

  it('keeps the TP:FP ratio at about 1:2 per variant', () => {
    for (const spec of matrix) {
      expect(spec.tpCount).toBeGreaterThanOrEqual(3);
      expect(spec.fpCount).toBeGreaterThanOrEqual(spec.tpCount * 2);
      // Strictly more FP than TP: the worker screens rules on fp_count >= 50% of alerts.
      expect(spec.fpCount).toBeGreaterThan(spec.tpCount);
    }
    expect(
      matrix
        .filter((m) => m.variant === 0)
        .map((m) => [m.baseId, m.tpCount, m.fpCount])
        .sort()
    ).toEqual(
      TUNING_BASE_RULES.map(({ id, expected }) => [id, 3, expected === 'threshold' ? 12 : 6]).sort()
    );
  });

  it('varies the burst size per variant for threshold bases, all above the threshold of 3 per host', () => {
    for (const base of TUNING_BASE_RULES.filter((b) => b.expected === 'threshold')) {
      const counts = [0, 1, 2].map(
        (v) => matrix.find((m) => m.baseId === base.id && m.variant === v)?.fpCount
      );
      expect(counts).toEqual([12, 16, 20]);
      // 3 hosts in each threshold profile: the smallest per-host share must beat threshold 3.
      expect(Math.floor((counts[0] as number) / 3)).toBeGreaterThan(3);
    }
  });

  it('keeps the expected decision identical across the three variants of one base rule', () => {
    for (const base of TUNING_BASE_RULES) {
      const expected = new Set(matrix.filter((m) => m.baseId === base.id).map((m) => m.expected));
      expect(expected).toEqual(new Set([base.expected]));
    }
  });

  it('shifts v1 timestamps by -2 days and leaves v0/v2 unshifted', () => {
    const v1 = matrix.find((m) => m.caseId === 'fp-overbroad-query-v1');
    const v2 = matrix.find((m) => m.caseId === 'fp-overbroad-query-v2');
    expect(v1?.timeShiftMs).toBe(-2 * 24 * 3600 * 1000);
    expect(v2?.timeShiftMs).toBe(0);
  });
});

describe('entity generation', () => {
  const spec = (
    caseId: string,
    spread: 'original' | 'multi' | 'single',
    expected: 'exception' | 'query' = 'exception'
  ) => ({
    caseId,
    baseId: caseId.replace(/-v\d$/, ''),
    variant: 1,
    expected,
    tpCount: 4,
    fpCount: 8,
    spread,
    timeShiftMs: 0,
  });
  const distinct = (fn: (slot: number) => string, n: number) =>
    new Set(Array.from({ length: n }, (_, i) => fn(i))).size;

  it('keeps the profile structure for v0: one name per distinct profile entity', () => {
    const s = spec('x-v0', 'original');
    expect(fpHostFor(s, 0, 0)).toBe(fpHostFor(s, 5, 0));
    expect(fpHostFor(s, 0, 0)).not.toBe(fpHostFor(s, 0, 1));
    expect(fpUserFor(s, 0, 2)).not.toBe(fpUserFor(s, 0, 1));
  });

  it('spreads v1 of an exception base over 4 hosts and 2 users', () => {
    const s = spec('x-v1', 'multi');
    expect(distinct((i) => fpHostFor(s, i, 0), 8)).toBe(4);
    expect(distinct((i) => fpUserFor(s, i, 0), 8)).toBe(2);
  });

  it('concentrates v2 of an exception base on 1 host and 1 user', () => {
    const s = spec('x-v2', 'single');
    expect(distinct((i) => fpHostFor(s, i, i), 10)).toBe(1);
    expect(distinct((i) => fpUserFor(s, i, i), 10)).toBe(1);
  });

  it.each(['multi', 'single'] as const)(
    'does NOT reshape a non-exception base on %s: the profile index decides',
    (spread) => {
      const s = spec('x-v1', spread, 'query');
      expect(reshapesEntities(s)).toBe(false);
      expect(distinct((i) => fpHostFor(s, i, i % 5), 10)).toBe(5);
      expect(distinct((i) => fpUserFor(s, i, i % 5), 10)).toBe(5);
    }
  );

  it('is deterministic for a given case id and variant', () => {
    const s = spec('x-v1', 'multi');
    expect(fpHostFor(s, 2, 0)).toBe(fpHostFor(s, 2, 0));
  });
});

describe('buildTpCohort', () => {
  it('labels each TP alert with the az-eval:tp tag and its case id', () => {
    const [specV0] = buildTuningVariantMatrix();
    const tps = buildTpCohort(specV0, 'mimikatz', ['10.0.4.11', '10.0.4.15']);
    expect(tps).toHaveLength(specV0.tpCount);
    for (const tp of tps) {
      expect(tp['az-eval:tp']).toBe(true);
      expect(tp['az-eval:case']).toBe(specV0.caseId);
      expect(tp['process.name']).toBe('mimikatz');
      // The TP /24 is one of the FP /24s passed in — never a TP-only subnet.
      expect(
        (['10.0.4', '10.1.0'] as const).includes(tp['source.ip'].split('.').slice(0, 3).join('.'))
      ).toBe(true);
    }
    expect(new Set(tps.map((t) => t['source.ip'])).size).toBe(tps.length);
  });

  it.each(buildTuningVariantMatrix().map((m) => [m.caseId, m] as const))(
    '%s: TP entities use the FP naming scheme in a disjoint index bucket',
    (_caseId, spec) => {
      const tps = buildTpCohort(spec, 'mimikatz', ['10.0.4.11', '10.0.4.15']);
      const tpHosts = new Set(tps.map((t) => String(t['host.name'])));
      const tpUsers = new Set(tps.map((t) => String(t['user.name'])));
      expect(tpHosts.size).toBe(spec.tpCount);
      const fpHosts = new Set(Array.from({ length: 24 }, (_, i) => fpHostFor(spec, i, i % 5)));
      const fpUsers = new Set(Array.from({ length: 24 }, (_, i) => fpUserFor(spec, i, i % 5)));
      for (const name of [...tpHosts, ...tpUsers, ...fpHosts, ...fpUsers]) {
        expect(name).toMatch(/^eval-[0-9a-f]{1,6}-[hu]\d+$/);
      }
      expect([...tpHosts].filter((h) => fpHosts.has(h))).toEqual([]);
      expect([...tpUsers].filter((u) => fpUsers.has(u))).toEqual([]);
    }
  );
});
