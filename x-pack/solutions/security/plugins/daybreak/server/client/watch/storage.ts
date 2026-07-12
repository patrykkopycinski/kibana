/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { WatchProperties } from './types';

export const watchIndexName = '.kibana-daybreak-watches';

const storageSettings = {
  name: watchIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      name: types.text({}),
      description: types.text({}),
      surface: types.keyword({}),
      status: types.keyword({}),
      autonomyTier: types.keyword({}),
      skillIds: types.keyword({}),
      createdAt: types.date({}),
      updatedAt: types.date({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

type WatchStorageSettings = typeof storageSettings;
export type WatchStorage = StorageIndexAdapter<WatchStorageSettings, WatchProperties>;

export const createWatchesStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): WatchStorage =>
  new StorageIndexAdapter<WatchStorageSettings, WatchProperties>(esClient, logger, storageSettings);
