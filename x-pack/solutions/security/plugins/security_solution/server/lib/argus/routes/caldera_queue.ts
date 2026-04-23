/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import {
  ARGUS_SOC_INDICES,
  CALDERA_QUEUE_ROUTE,
  buildCalderaQueue,
  type RawCalderaCommandDoc,
  type RawCalderaProfileDoc,
  type RawDifficultyStateDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const COMMAND_FETCH_SIZE = 200;
const PROFILE_FETCH_SIZE = 50;

const querySchema = schema.object({
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
});

export const registerCalderaQueueRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: CALDERA_QUEUE_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { query: querySchema } },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          const limit = request.query.limit ?? DEFAULT_LIMIT;

          // Three reads fan out in parallel — the difficulty-state document is
          // a singleton so a missing value is non-fatal (we pass `undefined`
          // to the builder). Profiles are also best-effort.
          const [commandHits, profileHits, difficultyStateDoc] = await Promise.all([
            fetchCommandHits(esClient, logger),
            fetchProfileHits(esClient, logger),
            fetchDifficultyState(esClient, logger),
          ]);

          const payload = buildCalderaQueue({
            commandHits,
            profileHits,
            difficultyStateDoc,
            limit,
          });

          return response.ok({ body: payload });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS caldera_queue route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

const warnIfNotMissing = (logger: Logger, context: string, err: unknown): void => {
  // `ignore_unavailable: true` already suppresses "index not found" errors on
  // the ES side, so reaching this catch means something else failed (mapping
  // error, permissions, transport). Surface those instead of silently hiding.
  const message = err instanceof Error ? err.message : String(err);
  logger.warn(`ARGUS caldera_queue ${context} failed (degraded response): ${message}`);
};

const fetchCommandHits = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<ReadonlyArray<{ readonly doc_id: string; readonly source: RawCalderaCommandDoc }>> => {
  try {
    const res = await esClient.search<Record<string, unknown>>({
      index: ARGUS_SOC_INDICES.attackCommands,
      ignore_unavailable: true,
      size: COMMAND_FETCH_SIZE,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      _source: true,
      track_total_hits: false,
    });
    const hits = res.hits?.hits ?? [];
    return hits
      .filter((h) => h._source)
      .map((h) => ({
        doc_id: String(h._id ?? ''),
        source: h._source as RawCalderaCommandDoc,
      }));
  } catch (err) {
    warnIfNotMissing(logger, 'command-fetch', err);
    return [];
  }
};

const fetchProfileHits = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<ReadonlyArray<{ readonly doc_id: string; readonly source: RawCalderaProfileDoc }>> => {
  try {
    const res = await esClient.search<Record<string, unknown>>({
      index: ARGUS_SOC_INDICES.attackProfiles,
      ignore_unavailable: true,
      size: PROFILE_FETCH_SIZE,
      sort: [{ difficulty_level: { order: 'asc', unmapped_type: 'integer' } }],
      _source: true,
      track_total_hits: false,
    });
    const hits = res.hits?.hits ?? [];
    return hits
      .filter((h) => h._source)
      .map((h) => ({
        doc_id: String(h._id ?? ''),
        source: h._source as RawCalderaProfileDoc,
      }));
  } catch (err) {
    warnIfNotMissing(logger, 'profile-fetch', err);
    return [];
  }
};

const fetchDifficultyState = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<RawDifficultyStateDoc | undefined> => {
  try {
    const res = await esClient.search<Record<string, unknown>>({
      index: ARGUS_SOC_INDICES.difficultyState,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      _source: true,
      track_total_hits: false,
    });
    const first = res.hits?.hits?.[0];
    return first?._source as RawDifficultyStateDoc | undefined;
  } catch (err) {
    warnIfNotMissing(logger, 'difficulty-state-fetch', err);
    return undefined;
  }
};
