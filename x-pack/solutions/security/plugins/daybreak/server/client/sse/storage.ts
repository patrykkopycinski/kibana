/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { SignificantSecurityEventProperties } from '../../common/schemas/sse';

export const sseIndexName = '.kibana-daybreak-sse';

const storageSettings = {
  name: sseIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      schemaVersion: types.keyword({}),
      title: types.text({}),
      description: types.text({}),
      findingType: types.keyword({}),
      sourceProposalId: types.keyword({}),
      sourceInvestigationId: types.keyword({}),
      sourceWatch: types.keyword({}),
      sourceWorkerId: types.keyword({}),
      capability: types.keyword({}),
      severity: types.keyword({}),
      confidence: types.float({}),
      status: types.keyword({}),
      evidenceRefs: types.keyword({}),
      entities: types.keyword({}),
      recommendedActions: types.object({
        properties: {
          id: types.keyword({}),
          description: types.text({}),
          autonomyRequired: types.keyword({}),
        },
      }),
      destinations: types.object({
        properties: {
          id: types.keyword({}),
          kind: types.keyword({}),
          reference: types.keyword({}),
        },
      }),
      createdAt: types.date({}),
      updatedAt: types.date({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export type SseStorageSettings = typeof storageSettings;

export type SseStorage = StorageIndexAdapter<
  SseStorageSettings,
  SignificantSecurityEventProperties
>;

export const createSseStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): SseStorage => {
  return new StorageIndexAdapter<SseStorageSettings, SignificantSecurityEventProperties>(
    esClient,
    logger,
    storageSettings
  );
};
