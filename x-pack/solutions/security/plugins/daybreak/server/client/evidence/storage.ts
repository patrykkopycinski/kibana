/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';

/** Index name for .daybreak-evidence. */
export const evidenceIndexName = '.daybreak-evidence';

const storageSettings = {
  name: evidenceIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      kind: types.keyword({}),
      sourceRef: types.keyword({}),
      summary: types.text({}),
      provenance: types.keyword({}),
      confidence: types.float({}),
      stance: types.keyword({}),
      limitations: types.keyword({}),
      sensitivityLabel: types.keyword({}),
      createdAt: types.date({}),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export type EvidenceStorageSettings = typeof storageSettings;

/** Full Evidence document stored in ES. */
export interface EvidenceProperties {
  id: string;
  kind: 'alert' | 'event' | 'entity' | 'timeline' | 'query' | 'assumption' | 'external';
  sourceRef?: string;
  summary: string;
  provenance: 'capability' | 'skillVersion' | 'tool';
  confidence: number;
  stance: 'for' | 'against';
  limitations?: string[];
  sensitivityLabel: 'public' | 'internal' | 'restricted';
  createdAt: string;
  space?: string;
}

export type EvidenceStorage = StorageIndexAdapter<EvidenceStorageSettings, EvidenceProperties>;

/** Create the evidence storage layer. */
export const createEvidenceStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): EvidenceStorage => {
  return new StorageIndexAdapter<EvidenceStorageSettings, EvidenceProperties>(
    esClient,
    logger,
    storageSettings
  );
};
