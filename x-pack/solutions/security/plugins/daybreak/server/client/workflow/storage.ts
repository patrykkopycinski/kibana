/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { WorkflowProperties } from './types';

export const workflowIndexName = '.kibana-daybreak-workflows';

const storageSettings = {
  name: workflowIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      name: types.text({}),
      trigger: types.keyword({}),
      skillId: types.keyword({}),
      outcome: types.text({}),
      watchIds: types.keyword({}),
      enabled: types.boolean({}),
      priority: types.float({}),
      lastRunAt: types.date({}),
      activeExecutionId: types.keyword({}),
      auditTrail: types.object({
        properties: {
          action: types.keyword({}),
          timestamp: types.date({}),
        },
      }),
      deletedAt: types.date({}),
      createdAt: types.date({}),
      updatedAt: types.date({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

type WorkflowStorageSettings = typeof storageSettings;
export type WorkflowStorage = StorageIndexAdapter<WorkflowStorageSettings, WorkflowProperties>;

export const createWorkflowsStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): WorkflowStorage =>
  new StorageIndexAdapter<WorkflowStorageSettings, WorkflowProperties>(
    esClient,
    logger,
    storageSettings
  );
