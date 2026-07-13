/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { InvestigationProperties } from '../../common/schemas/investigation';

export const investigationIndexName = '.kibana-daybreak-investigations';

const storageSettings = {
  name: investigationIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      schemaVersion: types.keyword({}),
      title: types.text({}),
      summary: types.text({}),
      sourceProposalId: types.keyword({}),
      sourceWatch: types.keyword({}),
      sourceWorkerId: types.keyword({}),
      capability: types.keyword({}),
      status: types.keyword({}),
      hypotheses: types.object({
        properties: {
          id: types.keyword({}),
          statement: types.text({}),
          confidence: types.float({}),
          status: types.keyword({}),
        },
      }),
      evidenceRefs: types.keyword({}),
      timeline: types.object({
        properties: {
          timestamp: types.date({}),
          description: types.text({}),
          evidenceRef: types.keyword({}),
        },
      }),
      entities: types.object({
        properties: {
          id: types.keyword({}),
          name: types.keyword({}),
          type: types.keyword({}),
          relevance: types.keyword({}),
        },
      }),
      openQuestions: types.keyword({}),
      decisions: types.keyword({}),
      createdAt: types.date({}),
      updatedAt: types.date({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export type InvestigationStorageSettings = typeof storageSettings;

export type InvestigationStorage = StorageIndexAdapter<
  InvestigationStorageSettings,
  InvestigationProperties
>;

export const createInvestigationsStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): InvestigationStorage => {
  return new StorageIndexAdapter<InvestigationStorageSettings, InvestigationProperties>(
    esClient,
    logger,
    storageSettings
  );
};
