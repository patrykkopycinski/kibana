/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { pollUntil } from './polling';

const noSleep = async () => {};

describe('pollUntil', () => {
  it('re-reads until the condition settles', async () => {
    const values = [[], [], ['proposal-1']];
    const read = jest.fn(async () => values.shift() ?? ['proposal-1']);

    const settled = await pollUntil({
      read,
      isSettled: (proposals: string[]) => proposals.length > 0,
      description: 'proposals',
      timeoutMs: 1_000,
      intervalMs: 1,
      sleep: noSleep,
    });

    expect(settled).toEqual(['proposal-1']);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('fails with the waited-for description when nothing settles', async () => {
    // Regression: the spec this replaces slept a fixed 5s and then read once,
    // so a slow fan-out was indistinguishable from a chain that never wrote.
    await expect(
      pollUntil({
        read: async () => [] as string[],
        isSettled: (proposals: string[]) => proposals.length > 0,
        description: 'proposals for inv-eval-1',
        timeoutMs: 5,
        intervalMs: 1,
        sleep: noSleep,
      })
    ).rejects.toThrow(/proposals for inv-eval-1 did not settle within 5ms/);
  });

  it('returns immediately when the first read already satisfies the condition', async () => {
    const read = jest.fn(async () => ['proposal-1']);

    await pollUntil({
      read,
      isSettled: (proposals: string[]) => proposals.length > 0,
      description: 'proposals',
      timeoutMs: 1_000,
      intervalMs: 1,
      sleep: noSleep,
    });

    expect(read).toHaveBeenCalledTimes(1);
  });
});
