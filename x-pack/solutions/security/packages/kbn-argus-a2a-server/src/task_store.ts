/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { A2aTask } from './types';

/**
 * Task store used by the A2A core to persist task state across
 * `tasks/send` and `tasks/get` calls. v1 ships with an in-memory store; a
 * future Elasticsearch-backed implementation writes to `.soc-a2a-tasks`
 * (tracked in roadmap/r12-a2a.md).
 */
export interface TaskStore {
  put(task: A2aTask): Promise<void>;
  get(taskId: string): Promise<A2aTask | undefined>;
  listForActor(actorId: string): Promise<readonly A2aTask[]>;
}

/**
 * Process-local store. Good enough for the MCP/A2A reference server shipped
 * with ARGUS, which is single-process; not safe to use in the HTTP transport
 * unless the transport is also single-process.
 */
export class InMemoryTaskStore implements TaskStore {
  private readonly byId = new Map<string, A2aTask>();

  async put(task: A2aTask): Promise<void> {
    this.byId.set(task.id, task);
  }

  async get(taskId: string): Promise<A2aTask | undefined> {
    return this.byId.get(taskId);
  }

  async listForActor(actorId: string): Promise<readonly A2aTask[]> {
    const out: A2aTask[] = [];
    for (const t of this.byId.values()) {
      if (t.principal_actor_id === actorId) out.push(t);
    }
    return out;
  }
}
