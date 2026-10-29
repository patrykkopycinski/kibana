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
    }
    expect(matrix.filter((m) => m.variant === 0).map((m) => [m.tpCount, m.fpCount])).toEqual(
      Array(10).fill([3, 6])
    );
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
  const spec = (caseId: string, spread: 'original' | 'multi' | 'single') => ({
    caseId,
    baseId: caseId.replace(/-v\d$/, ''),
    variant: 1,
    expected: 'exception' as const,
    tpCount: 4,
    fpCount: 8,
    spread,
    timeShiftMs: 0,
  });

  it('keeps the original host and user for v0', () => {
    expect(fpHostFor(spec('x-v0', 'original'), 3, 'build-agent-01')).toBe('build-agent-01');
    expect(fpUserFor(spec('x-v0', 'original'), 3, 'svc_jenkins')).toBe('svc_jenkins');
  });

  it('spreads v1 over 4 hosts and 2 users', () => {
    const hosts = new Set(
      Array.from({ length: 8 }, (_, i) => fpHostFor(spec('x-v1', 'multi'), i, 'o'))
    );
    const users = new Set(
      Array.from({ length: 8 }, (_, i) => fpUserFor(spec('x-v1', 'multi'), i, 'o'))
    );
    expect(hosts.size).toBe(4);
    expect(users.size).toBe(2);
  });

  it('concentrates v2 on 1 host and 1 user', () => {
    const hosts = new Set(
      Array.from({ length: 10 }, (_, i) => fpHostFor(spec('x-v2', 'single'), i, 'o'))
    );
    const users = new Set(
      Array.from({ length: 10 }, (_, i) => fpUserFor(spec('x-v2', 'single'), i, 'o'))
    );
    expect(hosts.size).toBe(1);
    expect(users.size).toBe(1);
  });

  it('is deterministic for a given case id and variant', () => {
    const a = fpHostFor(spec('x-v1', 'multi'), 2, 'o');
    const b = fpHostFor(spec('x-v1', 'multi'), 2, 'o');
    expect(a).toBe(b);
  });
});

describe('buildTpCohort', () => {
  it('labels each TP alert with the az-eval:tp tag and its case id', () => {
    const [specV0] = buildTuningVariantMatrix();
    const tps = buildTpCohort(specV0, 'mimikatz');
    expect(tps).toHaveLength(specV0.tpCount);
    for (const tp of tps) {
      expect(tp['az-eval:tp']).toBe(true);
      expect(tp['az-eval:case']).toBe(specV0.caseId);
      expect(tp['process.name']).toBe('mimikatz');
    }
  });

  it('gives TP alerts hosts distinct from the FP cluster', () => {
    const [spec] = buildTuningVariantMatrix();
    const tpHosts = new Set(buildTpCohort(spec, 'mimikatz').map((t) => t['host.name']));
    expect(tpHosts.size).toBe(spec.tpCount);
    expect([...tpHosts].some((h) => String(h).startsWith('eval-tp-'))).toBe(true);
  });
});
