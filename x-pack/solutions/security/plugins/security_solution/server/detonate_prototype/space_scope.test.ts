/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { DetonateClient } from './client';
import { DetonateServiceError } from './client';
import {
  countRunsInSpaceSince,
  getTaskInSpace,
  lookupPriorRunsInSpace,
  scopeTagsToSpace,
  submitInSpace,
} from './space_scope';

describe('space scope', () => {
  describe('scopeTagsToSpace', () => {
    it('adds the space tag when the caller sent none', () => {
      expect(scopeTagsToSpace(undefined, 'team-a')).toEqual(['space:team-a']);
    });

    it('replaces every caller-supplied space tag with the active one', () => {
      expect(scopeTagsToSpace(['space:team-b', 'demo', 'space:default'], 'team-a')).toEqual([
        'demo',
        'space:team-a',
      ]);
    });
  });

  describe('submitInSpace', () => {
    it('submits once with the active space tag', async () => {
      const submit = jest.fn().mockResolvedValue({ id: 'fresh', tags: ['space:team-a'] });

      await submitInSpace(
        submit,
        { sample_hash: 'a'.repeat(64), tags: ['space:team-b'] },
        'team-a'
      );

      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledWith({ sample_hash: 'a'.repeat(64), tags: ['space:team-a'] });
    });
  });

  describe('lookupPriorRunsInSpace', () => {
    const sha = 'A'.repeat(64);
    /** The hits are given newest first, the order the query's sort returns them in. */
    const esWith = (...sources: Array<Record<string, unknown>>) =>
      ({
        search: jest.fn().mockResolvedValue({
          hits: { hits: sources.map((source) => ({ _source: source })) },
        }),
      } as unknown as ElasticsearchClient & { search: jest.Mock });
    const runDoc = (taskId: string, verdict?: string, timestamp = '2026-11-03T00:00:00Z') => ({
      'detonate.task_id': taskId,
      '@timestamp': timestamp,
      ...(verdict ? { 'detonate.verdict': verdict } : {}),
    });

    it("searches this space's results index by the lowercased hash", async () => {
      const esClient = esWith();

      await lookupPriorRunsInSpace(esClient, sha, 'team-a');

      const [params] = esClient.search.mock.calls[0];
      expect(params.index).toBe('.kibana-detonate-results-team-a');
      expect(params.query.bool.filter).toEqual(
        expect.arrayContaining([
          { term: { 'detonate.doc_kind': 'run' } },
          { term: { 'file.hash.sha256': sha.toLowerCase() } },
          { term: { 'detonate.state': 'complete' } },
        ])
      );
    });

    it('answers known-malicious from the newest completed malicious run', async () => {
      const result = await lookupPriorRunsInSpace(
        esWith(runDoc('run-1', 'malicious')),
        sha,
        'team-a'
      );

      expect(result).toEqual({
        sha256: sha.toLowerCase(),
        status: 'known-malicious',
        source: 'prior-detonation',
        last_task_id: 'run-1',
        last_verdict: 'malicious',
        last_seen: '2026-11-03T00:00:00Z',
      });
    });

    it('answers unknown when the newest completed run was benign', async () => {
      const esClient = esWith(
        runDoc('run-2', 'benign', '2026-11-04T00:00:00Z'),
        runDoc('run-1', 'malicious', '2026-11-03T00:00:00Z')
      );

      const result = await lookupPriorRunsInSpace(esClient, sha, 'team-a');

      expect(result).toEqual(
        expect.objectContaining({
          status: 'unknown',
          last_task_id: 'run-2',
          last_verdict: 'benign',
        })
      );
      const [params] = esClient.search.mock.calls[0];
      expect(params.size).toBe(1);
      expect(params.sort).toEqual([{ '@timestamp': 'desc' }, { 'detonate.task_id': 'desc' }]);
    });

    it('answers unknown with no run reference when the space has no completed run', async () => {
      const result = await lookupPriorRunsInSpace(esWith(), sha, 'team-a');

      expect(result).toEqual({
        sha256: sha.toLowerCase(),
        status: 'unknown',
        source: 'prior-detonation',
      });
    });
  });

  describe('countRunsInSpaceSince', () => {
    const since = '2026-11-01T00:00:00.000Z';
    const run = (id: string, createdAt: string, space = 'team-a') => ({
      id,
      created_at: createdAt,
      tags: [`space:${space}`],
    });
    /** Pages a newest-first list the way the service does: by offset, with no total. */
    const pagingClient = (tasks: unknown[]) =>
      ({
        listTasks: jest.fn(
          async ({ offset = 0, size = 20 }: { offset?: number; size?: number }) => ({
            tasks: tasks.slice(offset, offset + size),
            offset,
            size,
            order: 'desc',
          })
        ),
      } as unknown as DetonateClient & { listTasks: jest.Mock });

    it('counts runs at or after the start of the window and stops at the first older one', async () => {
      const client = pagingClient([
        run('r3', '2026-11-05T00:00:00.000Z'),
        run('r2', '2026-11-01T00:00:00.000Z'),
        run('r1', '2026-10-31T23:59:59.999Z'),
        run('r0', '2026-10-01T00:00:00.000Z'),
      ]);

      await expect(
        countRunsInSpaceSince(client, 'team-a', since, { pageSize: 2 })
      ).resolves.toEqual({ count: 2, truncated: false });
      // The second page already reaches past the window, so no third read.
      expect(client.listTasks).toHaveBeenCalledTimes(2);
      expect(client.listTasks).toHaveBeenNthCalledWith(2, {
        query_string: 'tags:"space:team-a"',
        order: 'desc',
        offset: 2,
        size: 2,
      });
    });

    it('stops on a short page', async () => {
      const client = pagingClient([run('r1', '2026-11-02T00:00:00.000Z')]);

      await expect(countRunsInSpaceSince(client, 'team-a', since)).resolves.toEqual({
        count: 1,
        truncated: false,
      });
      expect(client.listTasks).toHaveBeenCalledTimes(1);
    });

    it('does not count a run from another space even if the service returned it', async () => {
      const client = pagingClient([
        run('mine', '2026-11-03T00:00:00.000Z'),
        run('theirs', '2026-11-02T00:00:00.000Z', 'team-b'),
      ]);

      await expect(countRunsInSpaceSince(client, 'team-a', since)).resolves.toEqual({
        count: 1,
        truncated: false,
      });
    });

    it('reports a lower bound when it stops at the page cap', async () => {
      const client = pagingClient(
        Array.from({ length: 5 }, (_, i) => run(`r${i}`, '2026-11-02T00:00:00.000Z'))
      );

      await expect(
        countRunsInSpaceSince(client, 'team-a', since, { pageSize: 2, maxPages: 2 })
      ).resolves.toEqual({ count: 4, truncated: true });
      expect(client.listTasks).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTaskInSpace', () => {
    const clientWith = (tags: string[]) =>
      ({
        getTask: jest.fn().mockResolvedValue({ id: 'task-1', tags }),
      } as unknown as DetonateClient);

    it('returns a run tagged with the active space', async () => {
      await expect(
        getTaskInSpace(clientWith(['space:team-a']), 'task-1', 'team-a')
      ).resolves.toEqual(expect.objectContaining({ id: 'task-1' }));
    });

    it.each([
      ['another space', ['space:team-b']],
      ['no space tag', []],
    ])('answers 404 for a run with %s', async (_label, tags) => {
      const read = getTaskInSpace(clientWith(tags), 'task-1', 'team-a');

      await expect(read).rejects.toBeInstanceOf(DetonateServiceError);
      await expect(read).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
