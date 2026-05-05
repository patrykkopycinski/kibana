/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elastic B.V. and/or licensed to Elastic B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fromArtifact, stringifyArtifact, toArtifact, type RuleLikeInput } from './rule_artifact';

const buildRule = (overrides: Partial<RuleLikeInput> = {}): RuleLikeInput => ({
  rule_id: 'argus.lsass-dump',
  rule_version: '1',
  name: 'LSASS Credential Dumping',
  description: 'Detects procdump / comsvcs MiniDump against lsass.exe.',
  query: {
    bool: {
      filter: [
        { term: { 'process.name': 'procdump.exe' } },
        { term: { 'process.target.name': 'lsass.exe' } },
      ],
    },
  },
  ...overrides,
});

describe('toArtifact', () => {
  it('produces an envelope with the canonical apiVersion + kind', () => {
    const artifact = toArtifact(buildRule());
    expect(artifact.apiVersion).toBe('argus.elastic.co/v1');
    expect(artifact.kind).toBe('ARGUSDetectionRule');
  });

  it('maps rule_id → metadata.name and rule_version → metadata.version', () => {
    const artifact = toArtifact(buildRule());
    expect(artifact.metadata.name).toBe('argus.lsass-dump');
    expect(artifact.metadata.version).toBe('1');
  });

  it('defaults source to argus when not specified', () => {
    expect(toArtifact(buildRule()).metadata.source).toBe('argus');
  });

  it('honours explicit source override', () => {
    const a = toArtifact(buildRule(), { source: 'manual' });
    expect(a.metadata.source).toBe('manual');
  });

  it('omits authored_by / authored_at when not provided', () => {
    const artifact = toArtifact(buildRule());
    expect(artifact.metadata.authored_by).toBeUndefined();
    expect(artifact.metadata.authored_at).toBeUndefined();
  });

  it('preserves authored_by and authored_at when provided', () => {
    const artifact = toArtifact(buildRule(), {
      authored_by: 'argus.synthesis.driver',
      authored_at: '2026-05-05T12:00:00Z',
    });
    expect(artifact.metadata.authored_by).toBe('argus.synthesis.driver');
    expect(artifact.metadata.authored_at).toBe('2026-05-05T12:00:00Z');
  });

  it('sorts label and annotation keys for deterministic output', () => {
    const artifact = toArtifact(buildRule(), {
      labels: { zeta: 'z', alpha: 'a', mu: 'm' },
      annotations: { 'kbn.io/foo': '1', 'argus.io/bar': '2' },
    });
    expect(Object.keys(artifact.metadata.labels ?? {})).toEqual(['alpha', 'mu', 'zeta']);
    expect(Object.keys(artifact.metadata.annotations ?? {})).toEqual([
      'argus.io/bar',
      'kbn.io/foo',
    ]);
  });

  it('preserves the query block byte-identical', () => {
    const rule = buildRule();
    const artifact = toArtifact(rule);
    expect(artifact.spec.query).toEqual(rule.query);
  });

  it('preserves and sorts gate_overrides keys when present', () => {
    const rule = buildRule({
      gate_overrides: { min_recall: 0.5, max_fp_rate: 0.05, min_precision: 0.85 },
    });
    const artifact = toArtifact(rule);
    expect(Object.keys(artifact.spec.gate_overrides ?? {})).toEqual([
      'max_fp_rate',
      'min_precision',
      'min_recall',
    ]);
  });

  it('omits gate_overrides when not set', () => {
    const artifact = toArtifact(buildRule());
    expect(artifact.spec.gate_overrides).toBeUndefined();
  });

  it('throws if rule_id is empty', () => {
    expect(() => toArtifact(buildRule({ rule_id: '' }))).toThrow(/rule_id/);
  });

  it('throws if rule_version is empty', () => {
    expect(() => toArtifact(buildRule({ rule_version: '   ' }))).toThrow(/rule_version/);
  });

  it('throws if query is not a plain object', () => {
    expect(() =>
      toArtifact(buildRule({ query: null as unknown as RuleLikeInput['query'] }))
    ).toThrow(/query/);
  });
});

describe('fromArtifact', () => {
  it('round-trips a rule with no extras', () => {
    const original = buildRule();
    const parsed = fromArtifact(toArtifact(original));
    expect(parsed).toEqual(original);
  });

  it('round-trips a rule with gate_overrides', () => {
    const original = buildRule({
      gate_overrides: { min_precision: 0.85, max_fp_rate: 0.04 },
    });
    const parsed = fromArtifact(toArtifact(original));
    expect(parsed).toEqual(original);
  });

  it('drops authored_by/at on parse (round-trip is rule-shape only)', () => {
    const artifact = toArtifact(buildRule(), {
      authored_by: 'analyst-a',
      authored_at: '2026-05-05T12:00:00Z',
    });
    const parsed = fromArtifact(artifact);
    expect(parsed).toEqual(buildRule());
  });

  it('rejects unsupported apiVersion', () => {
    const artifact = toArtifact(buildRule());
    const broken = { ...artifact, apiVersion: 'wrong/v1' };
    expect(() => fromArtifact(broken)).toThrow(/apiVersion/);
  });

  it('rejects unsupported kind', () => {
    const artifact = toArtifact(buildRule());
    const broken = { ...artifact, kind: 'NotARule' };
    expect(() => fromArtifact(broken)).toThrow(/kind/);
  });

  it('rejects when metadata.name is missing', () => {
    const artifact = toArtifact(buildRule());
    const broken = {
      ...artifact,
      metadata: { ...artifact.metadata, name: '' },
    };
    expect(() => fromArtifact(broken)).toThrow(/metadata.name/);
  });

  it('rejects when spec.query is missing', () => {
    const artifact = toArtifact(buildRule());
    const broken = {
      ...artifact,
      spec: { name: artifact.spec.name, description: artifact.spec.description },
    };
    expect(() => fromArtifact(broken)).toThrow(/spec.query/);
  });

  it('rejects non-object input', () => {
    expect(() => fromArtifact('hello' as unknown)).toThrow(/plain object/);
    expect(() => fromArtifact(null)).toThrow(/plain object/);
    expect(() => fromArtifact(undefined)).toThrow(/plain object/);
  });
});

describe('stringifyArtifact', () => {
  it('produces deterministic 2-space-indented JSON ending in newline', () => {
    const artifact = toArtifact(buildRule(), {
      authored_by: 'argus.synthesis.driver',
      authored_at: '2026-05-05T12:00:00Z',
      labels: { tier: 'platinum', team: 'detection' },
    });
    const a = stringifyArtifact(artifact);
    const b = stringifyArtifact(artifact);
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    expect(a).toContain('\n  "apiVersion"');
  });

  it('round-trips through JSON.parse + fromArtifact', () => {
    const original = buildRule({
      gate_overrides: { min_precision: 0.92, max_fp_rate: 0.01 },
    });
    const json = stringifyArtifact(toArtifact(original));
    const parsed = fromArtifact(JSON.parse(json));
    expect(parsed).toEqual(original);
  });
});
