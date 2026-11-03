/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateClient } from './client';
import { DetonateServiceError } from './client';
import {
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
