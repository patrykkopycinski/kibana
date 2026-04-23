/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { InMemoryTaskStore } from './task_store';
import type { A2aTask } from './types';

const baseTask = (overrides: Partial<A2aTask>): A2aTask => ({
  id: 'task-1',
  status: { state: 'submitted', timestamp: 1 },
  skill_id: 'soc-proactive-hunt',
  principal_actor_id: 'mcp:claude-desktop',
  artifacts: [],
  history: [],
  metadata: { propose_only: false, correlation_id: 'corr-1' },
  ...overrides,
});

describe('InMemoryTaskStore', () => {
  it('round-trips a task', async () => {
    const store = new InMemoryTaskStore();
    const t = baseTask({});
    await store.put(t);
    expect(await store.get('task-1')).toEqual(t);
  });

  it('returns undefined for missing ids', async () => {
    const store = new InMemoryTaskStore();
    expect(await store.get('missing')).toBeUndefined();
  });

  it('overwrites on re-put (same id, new status)', async () => {
    const store = new InMemoryTaskStore();
    await store.put(baseTask({ status: { state: 'submitted', timestamp: 1 } }));
    await store.put(baseTask({ status: { state: 'completed', timestamp: 2 } }));
    const got = await store.get('task-1');
    expect(got?.status.state).toBe('completed');
  });

  it('lists tasks filtered by actor id', async () => {
    const store = new InMemoryTaskStore();
    await store.put(baseTask({ id: 't1', principal_actor_id: 'mcp:alice' }));
    await store.put(baseTask({ id: 't2', principal_actor_id: 'mcp:alice' }));
    await store.put(baseTask({ id: 't3', principal_actor_id: 'mcp:bob' }));
    const alice = await store.listForActor('mcp:alice');
    expect(alice.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    const bob = await store.listForActor('mcp:bob');
    expect(bob.map((t) => t.id)).toEqual(['t3']);
  });
});
