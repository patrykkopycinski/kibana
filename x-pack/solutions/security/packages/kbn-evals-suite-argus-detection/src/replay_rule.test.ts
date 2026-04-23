/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { createEsReplayClient, variantDocId } from './replay_rule';
import { MYTHOS_DETECTION_RULES } from '../datasets/rule_pack';

type MockClient = Pick<Client, 'search'>;

describe('variantDocId', () => {
  it('joins primitive, axis, and index with dashes', () => {
    expect(variantDocId('T1003.001', 'command_args', 0)).toBe('T1003.001-command_args-0');
  });
});

describe('createEsReplayClient', () => {
  const corpusIndex = '.soc-eval-corpus-argus-corpus-mythos-2026-04';
  const corpusId = 'argus-corpus-mythos-2026-04';
  const rule = MYTHOS_DETECTION_RULES[0];

  const buildHit = (primitiveId: string, axis: string, index: number) => ({
    _id: variantDocId(primitiveId, axis, index),
    _source: {
      _argus: {
        corpus_id: corpusId,
        primitive_id: primitiveId,
        variant_axis: axis,
        variant_index: index,
      },
    },
  });

  it('returns the set of distinct variant IDs the rule matched', async () => {
    const search = jest.fn().mockResolvedValue({
      hits: {
        total: { value: 3, relation: 'eq' },
        hits: [
          buildHit('T1003.001', 'command_args', 0),
          buildHit('T1003.001', 'command_args', 1),
          buildHit('T1003.001', 'process_ancestry', 0),
        ],
      },
    });

    const client = createEsReplayClient({ search } as unknown as Client);
    const result = await client.replayRule({ rule, corpusIndex, corpusId });

    expect(result.rule_id).toBe(rule.rule_id);
    expect(result.fired_variant_ids).toEqual([
      'T1003.001-command_args-0',
      'T1003.001-command_args-1',
      'T1003.001-process_ancestry-0',
    ]);
    expect(result.fire_count).toBe(3);
    expect(result.error).toBeUndefined();
  });

  it('scopes the ES search to the requested corpus and excludes re-emissions', async () => {
    const search = jest.fn().mockResolvedValue({ hits: { total: { value: 0 }, hits: [] } });
    const client = createEsReplayClient({ search } as unknown as Client);

    await client.replayRule({ rule, corpusIndex, corpusId });

    expect(search).toHaveBeenCalledTimes(1);
    const request = search.mock.calls[0][0];
    expect(request.index).toBe(corpusIndex);
    const filters = request.query.bool.filter;
    expect(filters).toEqual(
      expect.arrayContaining([
        { term: { '_argus.corpus_id': corpusId } },
        { bool: { must_not: { term: { '_argus.is_simulation_emission': true } } } },
        rule.query,
      ])
    );
  });

  it('deduplicates hits that point at the same variant document', async () => {
    const search = jest.fn().mockResolvedValue({
      hits: {
        total: { value: 5 },
        hits: [
          buildHit('T1003.001', 'command_args', 0),
          buildHit('T1003.001', 'command_args', 0),
          buildHit('T1003.001', 'command_args', 0),
        ],
      },
    });
    const client = createEsReplayClient({ search } as unknown as MockClient as Client);

    const result = await client.replayRule({ rule, corpusIndex, corpusId });

    expect(result.fired_variant_ids).toEqual(['T1003.001-command_args-0']);
    // `fire_count` still reports the total so the orchestrator can tell a
    // noisy-but-correct rule apart from a tight-but-correct one.
    expect(result.fire_count).toBe(5);
  });

  it('captures ES failures in the `error` field without throwing', async () => {
    const search = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const client = createEsReplayClient({ search } as unknown as Client);

    const result = await client.replayRule({ rule, corpusIndex, corpusId });

    expect(result.error).toContain('ECONNREFUSED');
    expect(result.fired_variant_ids).toEqual([]);
    expect(result.fire_count).toBe(0);
  });

  it('handles a numeric total (older ES response shapes)', async () => {
    const search = jest.fn().mockResolvedValue({
      hits: {
        total: 2,
        hits: [buildHit('T1003.001', 'command_args', 0), buildHit('T1003.001', 'command_args', 1)],
      },
    });
    const client = createEsReplayClient({ search } as unknown as Client);

    const result = await client.replayRule({ rule, corpusIndex, corpusId });

    expect(result.fire_count).toBe(2);
    expect(result.fired_variant_ids).toHaveLength(2);
  });
});
