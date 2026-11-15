/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonationRecord } from '../../../../../common/detonate_prototype';
import {
  buildIndicatorsComment,
  buildStixBundle,
  getDetonationIndicators,
  toStixPattern,
} from './detonation_indicators';

const NOW = '2026-01-01T00:00:00.000Z';
const CREATED_AT = '2025-12-31T10:00:00.000Z';
const SHA256 = 'a'.repeat(64);

const record = (fields: Record<string, unknown>): DetonationRecord =>
  fields as unknown as DetonationRecord;

describe('getDetonationIndicators', () => {
  it('reports "not_read" when the record is missing', () => {
    expect(getDetonationIndicators(undefined)).toEqual({ state: 'not_read', rows: [] });
  });

  it('reports "not_read" when the record has no indicator arrays', () => {
    expect(getDetonationIndicators(record({ 'detonate.task_id': 't' }))).toEqual({
      state: 'not_read',
      rows: [],
    });
  });

  it('reports "none" when the arrays exist but are empty', () => {
    expect(
      getDetonationIndicators(
        record({
          'detonate.iocs.domains': [],
          'detonate.iocs.ips': [],
          'detonate.iocs.file_hashes': [],
        })
      )
    ).toEqual({ state: 'none', rows: [] });
  });

  it('lists domains, then ips, then hashes', () => {
    expect(
      getDetonationIndicators(
        record({
          'detonate.iocs.domains': ['evil.example'],
          'detonate.iocs.ips': ['10.0.0.1'],
          'detonate.iocs.file_hashes': [SHA256],
        })
      )
    ).toEqual({
      state: 'found',
      rows: [
        { type: 'domain', value: 'evil.example' },
        { type: 'ip', value: '10.0.0.1' },
        { type: 'file_hash', value: SHA256 },
      ],
    });
  });

  it('counts one empty array as read when another has values', () => {
    expect(getDetonationIndicators(record({ 'detonate.iocs.ips': ['10.0.0.1'] })).state).toBe(
      'found'
    );
  });
});

describe('toStixPattern', () => {
  it('builds a domain pattern', () => {
    expect(toStixPattern({ type: 'domain', value: 'evil.example' })).toBe(
      "[domain-name:value = 'evil.example']"
    );
  });

  it('builds an ipv4 pattern', () => {
    expect(toStixPattern({ type: 'ip', value: '10.0.0.1' })).toBe("[ipv4-addr:value = '10.0.0.1']");
  });

  it('builds an ipv6 pattern when the value has a colon', () => {
    expect(toStixPattern({ type: 'ip', value: '2001:db8::1' })).toBe(
      "[ipv6-addr:value = '2001:db8::1']"
    );
  });

  it.each([
    [32, 'MD5'],
    [40, 'SHA-1'],
    [64, 'SHA-256'],
    [128, 'SHA-512'],
  ])('names a %i-character hash %s', (length, algorithm) => {
    const value = 'b'.repeat(length);
    expect(toStixPattern({ type: 'file_hash', value })).toBe(
      `[file:hashes.'${algorithm}' = '${value}']`
    );
  });

  it('returns undefined for a hash of unknown length', () => {
    expect(toStixPattern({ type: 'file_hash', value: 'abc' })).toBeUndefined();
  });

  it('escapes quotes and backslashes so a value cannot close the pattern', () => {
    expect(toStixPattern({ type: 'domain', value: "a'b\\c" })).toBe(
      "[domain-name:value = 'a\\'b\\\\c']"
    );
  });
});

describe('buildStixBundle', () => {
  const rows = [
    { type: 'domain' as const, value: 'evil.example' },
    { type: 'ip' as const, value: '10.0.0.1' },
    { type: 'file_hash' as const, value: SHA256 },
  ];

  it('builds a STIX 2.1 bundle with one indicator per row', () => {
    const bundle = buildStixBundle('task-1', rows, NOW);
    expect(bundle.type).toBe('bundle');
    expect(bundle.id).toMatch(/^bundle--[0-9a-f-]{36}$/);
    expect(bundle.objects.map(({ pattern }) => pattern)).toEqual([
      "[domain-name:value = 'evil.example']",
      "[ipv4-addr:value = '10.0.0.1']",
      `[file:hashes.'SHA-256' = '${SHA256}']`,
    ]);
    expect(bundle.objects[0]).toMatchObject({
      type: 'indicator',
      spec_version: '2.1',
      pattern_type: 'stix',
      created: NOW,
      modified: NOW,
      valid_from: NOW,
    });
    expect(bundle.objects[0].id).toMatch(/^indicator--[0-9a-f-]{36}$/);
  });

  it('stamps the run creation time and marks every indicator as malicious activity', () => {
    const bundle = buildStixBundle('task-1', rows, CREATED_AT);
    bundle.objects.forEach((indicator) => {
      expect(indicator).toMatchObject({
        created: CREATED_AT,
        modified: CREATED_AT,
        valid_from: CREATED_AT,
        indicator_types: ['malicious-activity'],
      });
    });
  });

  it('gives the same indicator a different id in a different run', () => {
    const first = buildStixBundle('task-1', rows, NOW).objects.map(({ id }) => id);
    const second = buildStixBundle('task-2', rows, NOW).objects.map(({ id }) => id);
    first.forEach((id, index) => expect(id).not.toBe(second[index]));
  });

  it('is deterministic for the same input', () => {
    expect(buildStixBundle('task-1', rows, NOW)).toEqual(buildStixBundle('task-1', rows, NOW));
  });

  it('gives different indicators different ids', () => {
    const ids = buildStixBundle('task-1', rows, NOW).objects.map(({ id }) => id);
    expect(new Set(ids).size).toBe(3);
  });

  it('drops duplicate patterns', () => {
    const bundle = buildStixBundle('task-1', [...rows, rows[0]], NOW);
    expect(bundle.objects).toHaveLength(3);
  });

  it('skips hashes of unknown length', () => {
    const bundle = buildStixBundle('task-1', [{ type: 'file_hash', value: 'abc' }], NOW);
    expect(bundle.objects).toEqual([]);
  });
});

describe('buildIndicatorsComment', () => {
  it('names the run and lists each indicator', () => {
    expect(buildIndicatorsComment('task-1', [{ type: 'domain', value: 'evil.example' }])).toBe(
      'Indicators observed in detonation run `task-1`:\n\n- domain: `evil.example`'
    );
  });
});
