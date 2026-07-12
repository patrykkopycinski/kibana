/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { WorkerEvalRecordProperties } from './types';

/**
 * Index name for the Daybreak worker evaluation record store.
 * Follows the same `.kibana-*` prefix convention as the proposals store so it
 * is covered by the `kibana_system` reserved role.
 */
export const workerEvalRecordIndexName = '.kibana-daybreak-worker-eval-records';

const storageSettings = {
  name: workerEvalRecordIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      runId: types.keyword({}),
      dataset: types.keyword({}),
      environment: types.keyword({}),
      capability: types.keyword({}),
      score: types.float({}),
      humanDecision: types.keyword({}),
      actual: types.flattened({}),
      expected: types.flattened({}),
      provenance: types.object({
        properties: {
          modelId: types.keyword({}),
          connectorId: types.keyword({}),
          inputTokens: types.long({}),
          outputTokens: types.long({}),
          latencyMs: types.long({}),
          costBasis: types.keyword({}),
        },
      }),
      createdAt: types.date({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export type WorkerEvalRecordStorageSettings = typeof storageSettings;

/** Storage adapter type for worker evaluation records. */
export type WorkerEvalRecordStorage = StorageIndexAdapter<
  WorkerEvalRecordStorageSettings,
  WorkerEvalRecordProperties
>;

/** Create the worker-evaluation-record storage layer. */
export const createWorkerEvalRecordsStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): WorkerEvalRecordStorage => {
  return new StorageIndexAdapter<WorkerEvalRecordStorageSettings, WorkerEvalRecordProperties>(
    esClient,
    logger,
    storageSettings
  );
};
