/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CatalogSkill } from './catalog';
import type { RoutedPrediction, RoutingItem } from './cascade';
import { ARMS } from './cascade';
import {
  analyseGate,
  assertDecisions,
  assertFrozenBaselines,
  buildArmMetrics,
  buildViewReport,
  decidePaths,
  freezeBaselines,
  renderViewMarkdown,
} from './report';

const skills: CatalogSkill[] = ['a', 'b', 'c'].map((id) => ({
  id,
  name: id,
  description: id,
  domain: id === 'c' ? 'search' : 'security',
  source: 'static',
}));

const item = (id: string, expected: string | null, extra: Partial<RoutingItem> = {}) => ({
  id,
  query: id,
  expected,
  ambiguous: false,
  source: expected === null ? ('control' as const) : ('benchmark' as const),
  queryType: expected === null ? ('control' as const) : ('direct' as const),
  ...extra,
});

const items: RoutingItem[] = [
  item('R1', 'a'),
  item('R2', 'b'),
  item('R3', 'a'),
  item('R4', 'b', { ambiguous: true }),
  item('N1', null),
  item('N2', null),
];

const predict = (
  id: string,
  ranked: string[],
  abstained = false,
  gateScore?: number,
  costUsd = 0
): RoutedPrediction => ({
  id,
  ranked,
  abstained,
  ...(gateScore === undefined ? {} : { gateScore }),
  inputTokens: costUsd ? 1000 : 0,
  outputTokens: 0,
  latencyMs: costUsd ? 700 : 0,
  costUsd,
});

const bm25: RoutedPrediction[] = [
  predict('R1', ['a', 'b']),
  predict('R2', ['a', 'b']),
  predict('R3', ['c', 'a']),
  predict('R4', ['b']),
  predict('N1', [], true),
  predict('N2', ['a']),
];

const cascade: RoutedPrediction[] = [
  predict('R1', ['a'], false, 0.9, 0.00004),
  predict('R2', ['b'], false, 0.8, 0.00004),
  predict('R3', ['a'], true, 0.4, 0.00004),
  predict('R4', ['a'], false, 0.7, 0.00004),
  predict('N1', ['a'], true, 0.1, 0.00004),
  predict('N2', ['a'], true, 0.2, 0.00004),
];

describe('buildArmMetrics', () => {
  it('scores routed, abstain and end-to-end on the headline rows only', () => {
    const metrics = buildArmMetrics(ARMS.bm25, items, bm25, skills);
    expect(metrics.routed.top1).toMatchObject({ k: 1, n: 3 });
    expect(metrics.routed.top3).toMatchObject({ k: 3, n: 3 });
    expect(metrics.abstain).toMatchObject({ k: 1, n: 2 });
    expect(metrics.endToEnd).toMatchObject({ k: 2, n: 5 });
    expect(metrics.ambiguousTop1).toMatchObject({ k: 1, n: 1 });
  });

  it('classifies errors and counts same-domain wrong picks', () => {
    const { errors } = buildArmMetrics(ARMS.bm25, items, bm25, skills);
    expect(errors.byClass).toEqual({ wrongSkill: 2, falseAbstain: 0, falseRoute: 1 });
    expect(errors.wrongSkillSameDomain).toBe(1);
    expect(errors.dominant).toBe('wrongSkill');
  });

  it('counts a gated-out expected row as a false abstain and reports usage per call', () => {
    const { errors, usage } = buildArmMetrics(ARMS.jevCascade, items, cascade, skills);
    expect(errors.byClass.falseAbstain).toBe(1);
    expect(usage.calls).toBe(6);
    expect(usage.costUsdPerCall).toBeCloseTo(0.00004, 10);
    expect(usage.latencyP50Ms).toBe(700);
  });

  it('refuses an arm that does not cover the population', () => {
    expect(() => buildArmMetrics(ARMS.bm25, items, bm25.slice(1), skills)).toThrow(/covers/);
  });
});

describe('analyseGate', () => {
  it('returns nothing for an arm without gate scores', () => {
    expect(analyseGate(ARMS.bm25, items, bm25)).toBeUndefined();
  });

  it('reports per-class firing, AUC and a best range', () => {
    const gate = analyseGate(ARMS.jevCascade, items, cascade);
    expect(gate?.auc).toBe(1);
    expect(gate?.firing['control (no skill)']).toMatchObject({ n: 2, fireRate: 0 });
    expect(gate?.firing.direct).toMatchObject({ n: 3 });
    expect(gate?.sweep).toHaveLength(19);
    expect(gate?.bestRange.balancedAccuracy).toBe(1);
    expect(gate?.degenerate).toBe(false);
  });

  it('flags a gate that passes most no-skill queries', () => {
    const always = cascade.map((p) => ({ ...p, gateScore: 0.95 }));
    expect(analyseGate(ARMS.jevCascade, items, always)?.degenerate).toBe(true);
  });
});

describe('path decisions', () => {
  const report = buildViewReport({
    view: 'security',
    items,
    skills,
    armPredictions: { [ARMS.bm25]: bm25, [ARMS.jevCascade]: cascade },
  });

  it('adopts a model arm only when it beats bm25 end to end', () => {
    expect(report.decisions).toEqual([
      expect.objectContaining({ path: ARMS.jevCascade, adopted: true, value: 0.8 }),
    ]);
  });

  it('records a rejected path with its failure mode', () => {
    const [decision] = decidePaths(
      report.arms.map((arm) =>
        arm.arm === ARMS.jevCascade ? { ...arm, endToEnd: { ...arm.endToEnd, rate: 0.1 } } : arm
      )
    );
    expect(decision).toMatchObject({ adopted: false, baselineValue: 0.4 });
    expect(decision.failureMode).toMatch(/false abstain/);
  });

  it('rejects a path that only ties the baseline', () => {
    const [decision] = decidePaths(
      report.arms.map((arm) =>
        arm.arm === ARMS.jevCascade ? { ...arm, endToEnd: { ...arm.endToEnd, rate: 0.4 } } : arm
      )
    );
    expect(decision.adopted).toBe(false);
  });

  it('rejects a hand-edited decision', () => {
    const edited = {
      ...report,
      decisions: [{ ...report.decisions[0], adopted: false }],
    };
    expect(() => assertDecisions(edited)).toThrow(/beats the baseline/);
  });

  it('pairs every non-oracle arm in McNemar on both metrics', () => {
    expect(report.comparisons.map(({ metric }) => metric)).toEqual(['endToEnd', 'routedTop1']);
  });

  it('renders every section', () => {
    const markdown = renderViewMarkdown(report);
    expect(markdown).toMatch(/Gate: jev cascade/);
    expect(markdown).toMatch(/Path decisions/);
  });
});

describe('frozen baselines', () => {
  const report = buildViewReport({
    view: 'security',
    items,
    skills,
    armPredictions: { [ARMS.bm25]: bm25, [ARMS.jevCascade]: cascade },
  });

  it('freezes only the zero-cost arms and reproduces them', () => {
    const frozen = freezeBaselines([report]);
    expect(Object.keys(frozen.security)).toEqual([ARMS.bm25]);
    expect(() => assertFrozenBaselines([report], frozen)).not.toThrow();
  });

  it('throws when a frozen number drifts', () => {
    expect(() =>
      assertFrozenBaselines([report], { security: { [ARMS.bm25]: { k: 3, n: 5 } } })
    ).toThrow(/re-freeze/);
  });
});
