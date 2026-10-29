/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateClient } from './client';
import { DetonateServiceError } from './client';
import { getTaskInSpace, scopeTagsToSpace, submitInSpace } from './space_scope';

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
    const request = { sample_hash: 'a'.repeat(64) };

    it('returns a fresh run without a second submit', async () => {
      const submit = jest.fn().mockResolvedValue({
        task: { id: 'fresh', tags: ['space:team-a'] },
        deduplicated: false,
      });

      await submitInSpace(submit, request, 'team-a');

      expect(submit).toHaveBeenCalledTimes(1);
    });

    it('keeps a deduplicated run from the same space', async () => {
      const outcome = { task: { id: 'reused', tags: ['space:team-a'] }, deduplicated: true };
      const submit = jest.fn().mockResolvedValue(outcome);

      await expect(submitInSpace(submit, request, 'team-a')).resolves.toBe(outcome);
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it('forces a fresh run instead of returning another space’s report', async () => {
      const submit = jest
        .fn()
        .mockResolvedValueOnce({
          task: { id: 'foreign', tags: ['space:team-b'] },
          deduplicated: true,
        })
        .mockResolvedValueOnce({
          task: { id: 'own', tags: ['space:team-a'] },
          deduplicated: false,
        });

      const outcome = await submitInSpace(submit, request, 'team-a');

      expect(outcome.task.id).toBe('own');
      expect(submit).toHaveBeenLastCalledWith({
        ...request,
        tags: ['space:team-a'],
        force_fresh: true,
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
