/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';

/**
 * Index name for the Daybreak action-result store. Prefixed with `.kibana-` so it
 * falls under the `.kibana*` index pattern granted to `kibana_system`.
 */
export const actionResultIndexName = '.kibana-daybreak-action-results';

const storageSettings = {
  name: actionResultIndexName,
  schema: {
    properties: {
      schemaVersion: types.keyword({}),
      id: types.keyword({}),
      actionType: types.keyword({}),
      target: types.keyword({}),
      requestedBy: types.keyword({}),
      approvedBy: types.keyword({}),
      executedBy: types.keyword({}),
      executedAt: types.date({}),
      status: types.keyword({}),
      outputSummary: types.text({}),
      /** Serialized JSON — avoids strict_dynamic_mapping on nested tool payloads. */
      toolResultJson: types.text({}),
      proposalId: types.keyword({}),
      sourceWorkerId: types.keyword({}),
      investigationId: types.keyword({}),
      workflowExecutionId: types.keyword({}),
      stub: types.boolean({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export type ActionResultStorageSettings = typeof storageSettings;

export type ActionResultStatus = 'completed' | 'failed' | 'partial' | 'stubbed';

/** Full Action Result document stored in ES. */
export interface ActionResultProperties {
  schemaVersion: string;
  id: string;
  actionType: string;
  target: string;
  requestedBy?: string;
  approvedBy?: string;
  executedBy: string;
  executedAt: string;
  status: ActionResultStatus;
  outputSummary: string;
  toolResult?: Record<string, unknown>;
  proposalId: string;
  sourceWorkerId?: string;
  investigationId?: string;
  workflowExecutionId?: string;
  stub?: boolean;
  space?: string;
}

/** ES document shape (toolResult stored as JSON text). */
export interface ActionResultStoredDocument extends Omit<ActionResultProperties, 'toolResult'> {
  toolResultJson?: string;
}

export type ActionResultStorage = StorageIndexAdapter<
  ActionResultStorageSettings,
  ActionResultStoredDocument
>;

/** Create the action-result storage layer. */
export const createActionResultStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): ActionResultStorage => {
  return new StorageIndexAdapter<ActionResultStorageSettings, ActionResultStoredDocument>(
    esClient,
    logger,
    storageSettings
  );
};
