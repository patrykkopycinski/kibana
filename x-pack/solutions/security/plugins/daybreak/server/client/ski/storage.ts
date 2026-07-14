/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { SecurityKnowledgeIndicatorProperties } from './types';

export const skiIndexName = '.kibana-daybreak-ski';

const storageSettings = {
  name: skiIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      type: types.keyword({}),
      normalizedName: types.keyword({}),
      source: types.keyword({}),
      collectedAt: types.date({}),
      confidence: types.float({}),
      scope: types.keyword({}),
      supportingEvidence: types.keyword({}),
      relatedRefs: types.keyword({}),
      expiresAt: types.date({}),
      sourceWatch: types.keyword({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

type SkiStorageSettings = typeof storageSettings;
export type SkiStorage = StorageIndexAdapter<SkiStorageSettings, SecurityKnowledgeIndicatorProperties>;

export const createSkiStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): SkiStorage =>
  new StorageIndexAdapter<SkiStorageSettings, SecurityKnowledgeIndicatorProperties>(
    esClient,
    logger,
    storageSettings
  );
