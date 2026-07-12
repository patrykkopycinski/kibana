/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { WorkerEvalRecordStorage } from './storage';
import type { WorkerEvalRecordProperties } from './types';
import { createWorkerEvalRecordsStorage } from './storage';

const MAX_RECORDS_PER_SPACE = 1000;

export interface WorkerEvalRecordCreateParams {
  runId: string;
  dataset: string;
  environment: string;
  capability: string;
  actual: Record<string, unknown>;
  expected: Record<string, unknown>;
  humanDecision?: WorkerEvalRecordProperties['humanDecision'];
  score: number;
  provenance: WorkerEvalRecordProperties['provenance'];
}

export interface WorkerEvalRecordClient {
  /** Create a new worker evaluation record. */
  create(params: WorkerEvalRecordCreateParams): Promise<WorkerEvalRecordProperties>;
  /** List all worker evaluation records for the current space, newest first. */
  list(): Promise<WorkerEvalRecordProperties[]>;
}

class WorkerEvalRecordClientImpl implements WorkerEvalRecordClient {
  private readonly space: string;
  private readonly storage: WorkerEvalRecordStorage;
  private readonly logger: Logger;

  constructor({
    space,
    storage,
    logger,
  }: {
    space: string;
    storage: WorkerEvalRecordStorage;
    logger: Logger;
  }) {
    this.space = space;
    this.storage = storage;
    this.logger = logger;
  }

  async create(params: WorkerEvalRecordCreateParams): Promise<WorkerEvalRecordProperties> {
    const id = randomUUID();
    const document: WorkerEvalRecordProperties = {
      ...params,
      id,
      createdAt: new Date().toISOString(),
      space: this.space,
    };

    await this.storage.getClient().index({
      document,
    });

    return document;
  }

  async list(): Promise<WorkerEvalRecordProperties[]> {
    const response = await this.storage.getClient().search({
      query: {
        bool: {
          filter: [{ term: { space: this.space } }],
        },
      },
      sort: [{ createdAt: { order: 'desc' } }],
      size: MAX_RECORDS_PER_SPACE,
      track_total_hits: true,
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    if (total > MAX_RECORDS_PER_SPACE) {
      this.logger.warn(
        `Space "${this.space}" has ${total} worker eval records which exceeds the limit of ${MAX_RECORDS_PER_SPACE}. Results are truncated.`
      );
    }

    return response.hits.hits.map(
      (hit) => (hit._source as WorkerEvalRecordProperties) ?? undefined!
    );
  }
}

export const createWorkerEvalRecordClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): WorkerEvalRecordClient => {
  const storage = createWorkerEvalRecordsStorage({ logger, esClient });
  return new WorkerEvalRecordClientImpl({ space, storage, logger });
};
