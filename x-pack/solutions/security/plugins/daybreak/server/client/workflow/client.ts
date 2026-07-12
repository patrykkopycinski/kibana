/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { createWorkflowConflictError, WorkflowNotFoundError } from './errors';
import { createWorkflowsStorage } from './storage';
import type { WorkflowAuditEvent, WorkflowDocument, WorkflowProperties } from './types';

const createSpaceFilter = (space: string) => ({ term: { space } });

export interface WorkflowCreateParams {
  id: string;
  name: string;
  trigger: string;
  skillId: string;
  outcome: string;
  watchIds?: string[];
  enabled?: boolean;
  priority?: number;
}

export type WorkflowUpdateParams = Partial<Omit<WorkflowCreateParams, 'id'>> & {
  lastRunAt?: string;
  activeExecutionId?: string;
};

export interface WorkflowClient {
  get(id: string): Promise<WorkflowProperties>;
  list(): Promise<WorkflowProperties[]>;
  listByWatch(watchId: string): Promise<WorkflowProperties[]>;
  create(input: WorkflowCreateParams): Promise<WorkflowProperties>;
  update(id: string, updates: WorkflowUpdateParams): Promise<WorkflowProperties>;
  pruneWatchReference(watchId: string): Promise<void>;
  delete(id: string): Promise<WorkflowProperties>;
  recordExecution(
    id: string,
    timestamp: string,
    activeExecutionId?: string
  ): Promise<WorkflowProperties>;
}

class WorkflowClientImpl implements WorkflowClient {
  private readonly storage;

  constructor(private readonly space: string, esClient: ElasticsearchClient, logger: Logger) {
    this.storage = createWorkflowsStorage({ esClient, logger });
  }

  async get(id: string): Promise<WorkflowProperties> {
    const document = await this.getById(id);
    if (!document || document._source?.deletedAt) throw new WorkflowNotFoundError(id);
    return document._source!;
  }

  async list(): Promise<WorkflowProperties[]> {
    const response = await this.storage.getClient().search({
      query: {
        bool: {
          filter: [
            createSpaceFilter(this.space),
            { bool: { must_not: [{ exists: { field: 'deletedAt' } }] } },
          ],
        },
      },
      size: 1000,
      sort: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      track_total_hits: true,
    });
    return response.hits.hits.map((hit) => hit._source as WorkflowProperties);
  }

  async listByWatch(watchId: string): Promise<WorkflowProperties[]> {
    return (await this.list()).filter((workflow) => workflow.watchIds.includes(watchId));
  }

  async create(input: WorkflowCreateParams): Promise<WorkflowProperties> {
    const existing = await this.getById(input.id);
    if (existing && !existing._source?.deletedAt) throw createWorkflowConflictError(input.id);
    const now = new Date().toISOString();
    const workflow: WorkflowProperties = {
      ...input,
      watchIds: input.watchIds ?? [],
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      auditTrail: [{ action: 'created', timestamp: now } satisfies WorkflowAuditEvent],
      createdAt: now,
      updatedAt: now,
      space: this.space,
    };
    await this.storage.getClient().index({ document: workflow });
    return this.get(input.id);
  }

  async update(id: string, updates: WorkflowUpdateParams): Promise<WorkflowProperties> {
    const document = await this.getById(id);
    if (!document) throw new WorkflowNotFoundError(id);
    const now = new Date().toISOString();
    const workflow: WorkflowProperties = {
      ...document._source!,
      ...updates,
      id: document._source!.id,
      space: document._source!.space,
      updatedAt: now,
      auditTrail: [
        ...(document._source!.auditTrail ?? []),
        { action: 'updated', timestamp: now } satisfies WorkflowAuditEvent,
      ],
    };
    await this.storage.getClient().index({ id: document._id, document: workflow });
    return workflow;
  }

  async recordExecution(
    id: string,
    timestamp: string,
    activeExecutionId?: string
  ): Promise<WorkflowProperties> {
    const document = await this.getById(id);
    if (!document || document._source?.deletedAt) throw new WorkflowNotFoundError(id);
    const workflow: WorkflowProperties = {
      ...document._source!,
      lastRunAt: timestamp,
      activeExecutionId,
      updatedAt: timestamp,
      auditTrail: [
        ...(document._source!.auditTrail ?? []),
        { action: 'executed', timestamp } satisfies WorkflowAuditEvent,
      ],
    };
    await this.storage.getClient().index({ id: document._id, document: workflow });
    return workflow;
  }

  async delete(id: string): Promise<WorkflowProperties> {
    const document = await this.getById(id);
    if (!document || document._source?.deletedAt) throw new WorkflowNotFoundError(id);
    const now = new Date().toISOString();
    const workflow: WorkflowProperties = {
      ...document._source!,
      deletedAt: now,
      updatedAt: now,
      auditTrail: [
        ...(document._source!.auditTrail ?? []),
        { action: 'deleted', timestamp: now } satisfies WorkflowAuditEvent,
      ],
    };
    await this.storage.getClient().index({ id: document._id, document: workflow });
    return workflow;
  }

  async pruneWatchReference(watchId: string): Promise<void> {
    const workflows = await this.listByWatch(watchId);
    await Promise.all(
      workflows.map((workflow) =>
        this.update(workflow.id, { watchIds: workflow.watchIds.filter((id) => id !== watchId) })
      )
    );
  }

  private async getById(id: string): Promise<WorkflowDocument | undefined> {
    const response = await this.storage.getClient().search({
      query: { bool: { filter: [createSpaceFilter(this.space), { term: { id } }] } },
      size: 1,
      terminate_after: 1,
      track_total_hits: false,
    });
    const hit = response.hits.hits[0];
    return hit ? ({ _id: hit._id!, _source: hit._source } as WorkflowDocument) : undefined;
  }
}

export const createWorkflowClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): WorkflowClient => new WorkflowClientImpl(space, esClient, logger);
