/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

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
    const completed = (id: string, tags: string[], alerts: number) => ({
      id,
      tags,
      created_at: `2026-11-0${id.length}T00:00:00Z`,
      sample_hash: sha.toLowerCase(),
      last_worker_name: 'detonate.workers.make_summary',
      last_worker_status: 'success',
      production_endpoint_alerts_count: alerts,
      production_endpoint_alert_groups:
        alerts > 0 ? [{ alerts_count: alerts, event_code: 'malicious_file' }] : [],
      diagnostic_endpoint_alert_groups: [],
      production_detection_alert_groups: [],
    });
    const clientWith = (tasks: unknown[]) =>
      ({
        listTasks: jest.fn().mockResolvedValue({ tasks, offset: 0, size: 20, order: 'desc' }),
      } as unknown as DetonateClient & { listTasks: jest.Mock });

    it('searches this space by the lowercased hash', async () => {
      const client = clientWith([]);

      await lookupPriorRunsInSpace(client, sha, 'team-a');

      expect(client.listTasks).toHaveBeenCalledWith({
        query_string: `tags:"space:team-a" AND sample_hash:"${sha.toLowerCase()}"`,
        size: 20,
        order: 'desc',
      });
    });

    it('answers known-malicious from the newest completed malicious run', async () => {
      const result = await lookupPriorRunsInSpace(
        clientWith([completed('run-1', ['space:team-a'], 3)]),
        sha,
        'team-a'
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: 'known-malicious',
          last_task_id: 'run-1',
          last_verdict: 'malicious',
        })
      );
    });

    it('answers unknown when the newest completed run was quiet', async () => {
      const result = await lookupPriorRunsInSpace(
        clientWith([completed('run-2', ['space:team-a'], 0), completed('r1', ['space:team-a'], 3)]),
        sha,
        'team-a'
      );

      expect(result).toEqual(expect.objectContaining({ status: 'unknown', last_verdict: 'quiet' }));
    });

    it('ignores a run from another space even if the service returned it', async () => {
      const result = await lookupPriorRunsInSpace(
        clientWith([completed('run-1', ['space:team-b'], 3)]),
        sha,
        'team-a'
      );

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
