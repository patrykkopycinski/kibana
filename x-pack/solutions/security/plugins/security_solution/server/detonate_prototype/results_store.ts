/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import {
  DETONATE_RESULTS_INDEX_PREFIX,
  DETONATE_RESULTS_TEMPLATE_NAME,
  detonateResultsIndexName,
} from '../../common/detonate_prototype';
import { DETONATION_RECORD_FIELDS } from './detonation_record';
import type { DetonationRecord, DetonationRecordFieldType } from './detonation_record';

/**
 * Keyword values past this length stay in `_source` but are not indexed, so one
 * long evidence string cannot make the whole document fail to index.
 */
const KEYWORD_IGNORE_ABOVE = 2048;

type Mapping = Record<
  string,
  { type?: DetonationRecordFieldType; ignore_above?: number; properties?: Mapping }
>;

/** Dotted record fields as nested `properties`, as Elasticsearch stores them. */
const buildMappingProperties = (): Mapping => {
  const properties: Mapping = {};
  Object.entries(DETONATION_RECORD_FIELDS).forEach(([path, type]) => {
    const keys = path.split('.');
    let node = properties;
    keys.slice(0, -1).forEach((key) => {
      node[key] = node[key] ?? { properties: {} };
      node = node[key].properties as Mapping;
    });
    node[keys[keys.length - 1]] =
      type === 'keyword' ? { type, ignore_above: KEYWORD_IGNORE_ABOVE } : { type };
  });
  return properties;
};

/** A plain hidden index per space, not a data stream: documents are upserted by task id. */
export const resultsIndexTemplate = (): estypes.IndicesPutIndexTemplateRequest => ({
  name: DETONATE_RESULTS_TEMPLATE_NAME,
  index_patterns: [`${DETONATE_RESULTS_INDEX_PREFIX}*`],
  priority: 500,
  _meta: { managed_by: 'security_solution', description: 'Detonate prototype run results' },
  template: {
    settings: { 'index.hidden': true },
    mappings: { dynamic: false, properties: buildMappingProperties() },
  },
});

/**
 * Both results-index writes run on the request path's heels, so a slow or
 * unreachable cluster must give up quickly instead of holding the connection
 * through the client's 30s timeout and its retries.
 */
const WRITE_TRANSPORT_OPTIONS = { requestTimeout: 2000, maxRetries: 0 } as const;

/** Overwrites rather than create-if-absent, so the template always matches this code. */
export const installResultsTemplate = async (esClient: ElasticsearchClient): Promise<void> => {
  await esClient.indices.putIndexTemplate(resultsIndexTemplate(), WRITE_TRANSPORT_OPTIONS);
};

/**
 * Writes one run's document, keyed by task id. A partial record merges into the
 * existing document, so fields only an earlier write knew (the submit origin)
 * survive a later write that does not carry them.
 */
export const upsertDetonationRecord = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  record: DetonationRecord
): Promise<void> => {
  await esClient.update(
    {
      index: detonateResultsIndexName(spaceId),
      id: record['detonate.task_id'],
      doc: record,
      doc_as_upsert: true,
    },
    WRITE_TRANSPORT_OPTIONS
  );
};

/**
 * Best-effort and at-most-once per call: a failed or timed-out write is not retried,
 * and the origin fields live only on the submit write, so losing it loses them for good.
 */
export type RecordRun = (spaceId: string, buildRecord: () => DetonationRecord) => Promise<void>;

/**
 * The one writer every surface shares. It writes as the internal user, so each
 * caller must have checked the analyst's space and privileges first. A failure
 * only logs: what the analyst sees never depends on the results index. The
 * record is built inside the guard so a task the mapper cannot read is not an
 * error for the caller either.
 */
export const createRunRecorder = ({
  getInternalEsClient,
  logger,
}: {
  getInternalEsClient: () => Promise<ElasticsearchClient>;
  logger: Logger;
}): RecordRun => {
  // Installed once per process; a failed install is retried on the next call.
  let template: Promise<void> | undefined;
  const ensureTemplate = (esClient: ElasticsearchClient) => {
    template =
      template ??
      installResultsTemplate(esClient).catch((error) => {
        template = undefined;
        throw error;
      });
    return template;
  };

  return async (spaceId, buildRecord) => {
    let taskId: string | undefined;
    try {
      const record = buildRecord();
      taskId = record['detonate.task_id'];
      const esClient = await getInternalEsClient();
      await ensureTemplate(esClient);
      await upsertDetonationRecord(esClient, spaceId, record);
    } catch (error) {
      logger.warn(
        `Detonation ${taskId ?? 'unknown'}: could not write the results document: ${error}`
      );
    }
  };
};
