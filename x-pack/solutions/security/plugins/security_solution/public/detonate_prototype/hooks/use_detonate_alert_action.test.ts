/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Unit tests for the prefill helpers the "Detonate file" alert action uses.
 *
 * The helpers are the contract between the alert action and the submission
 * page: if the query-string format drifts, the action silently stops
 * pre-filling and the run loses its tie back to the alert. These tests pin
 * the round trip both ways.
 */

import type { DataTableRecord } from '@kbn/discover-utils';

import { buildDetonatePrefillPath, getDetonatableHash } from './use_detonate_alert_action';

const hitWith = (flattened: Record<string, unknown>): DataTableRecord =>
  ({ flattened, raw: {} } as unknown as DataTableRecord);

describe('getDetonatableHash', () => {
  it('prefers SHA-256 over the weaker digests, wherever it appears', () => {
    expect(
      getDetonatableHash(
        hitWith({
          'file.hash.sha256': 'a'.repeat(64),
          'file.hash.sha1': 'b'.repeat(40),
        })
      )
    ).toBe('a'.repeat(64));
  });

  it('falls back through the hash fields in preference order', () => {
    expect(
      getDetonatableHash(
        hitWith({
          'process.hash.sha256': 'c'.repeat(64),
          'file.hash.md5': 'd'.repeat(32),
        })
      )
    ).toBe('c'.repeat(64));
  });

  it('returns undefined when the document carries no hash', () => {
    expect(getDetonatableHash(hitWith({ 'source.ip': '10.0.0.1' }))).toBeUndefined();
  });

  it('skips empty string values rather than returning them', () => {
    expect(
      getDetonatableHash(hitWith({ 'file.hash.sha256': '', 'file.hash.md5': 'e'.repeat(32) }))
    ).toBe('e'.repeat(32));
  });

  it('takes the first entry of an array-valued field', () => {
    expect(
      getDetonatableHash(hitWith({ 'file.hash.sha256': ['f'.repeat(64), 'g'.repeat(64)] }))
    ).toBe('f'.repeat(64));
  });
});

describe('buildDetonatePrefillPath', () => {
  it('round-trips: the path the page reads parses back to the same input', () => {
    const hash = 'a'.repeat(64);
    const tags = ['alert:some-document-id'];

    const query = new URLSearchParams(buildDetonatePrefillPath({ hash, tags }).slice(1));

    expect(query.get('sample_hash')).toBe(hash);
    expect(query.getAll('tags')).toEqual(tags);
  });

  it('appends multiple tags rather than collapsing them', () => {
    const query = new URLSearchParams(
      buildDetonatePrefillPath({ hash: 'b'.repeat(64), tags: ['alert:one', 'demo'] }).slice(1)
    );

    expect(query.getAll('tags')).toEqual(['alert:one', 'demo']);
  });

  it('omits the tags parameter entirely when there are none', () => {
    const query = new URLSearchParams(
      buildDetonatePrefillPath({ hash: 'c'.repeat(64), tags: [] }).slice(1)
    );

    expect(query.has('tags')).toBe(false);
  });
});
