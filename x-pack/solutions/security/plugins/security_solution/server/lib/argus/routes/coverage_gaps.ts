/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import type { ElasticsearchClient } from '@kbn/core/server';

import {
  ARGUS_SOC_INDICES,
  COVERAGE_GAPS_ROUTE,
  buildCoverageGaps,
  type RawCoverageHit,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

type CoverageWindow = '24h' | '7d';

const WINDOW_MAP: Record<CoverageWindow, string> = {
  '24h': 'now-24h',
  '7d': 'now-7d',
};

const DEFAULT_WINDOW: CoverageWindow = '7d';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const FETCH_SIZE = 500;

const querySchema = schema.object({
  window: schema.maybe(schema.oneOf([schema.literal('24h'), schema.literal('7d')])),
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
});

export const registerCoverageGapsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: COVERAGE_GAPS_ROUTE,
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

          const windowKey: CoverageWindow = request.query.window ?? DEFAULT_WINDOW;
          const now = new Date();
          const windowEnd = now.toISOString();
          const windowStart = deriveWindowStart(windowKey, now);
          const limit = request.query.limit ?? DEFAULT_LIMIT;

          const hits = await fetchCoverageHits(esClient, windowKey);

          const payload = buildCoverageGaps({
            hits,
            windowStart,
            windowEnd,
            limit,
          });

          return response.ok({ body: payload });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS coverage_gaps route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

const deriveWindowStart = (window: CoverageWindow, now: Date): string => {
  const ms = window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms).toISOString();
};

const fetchCoverageHits = async (
  esClient: ElasticsearchClient,
  window: CoverageWindow
): Promise<readonly RawCoverageHit[]> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.coverageGaps,
    ignore_unavailable: true,
    size: FETCH_SIZE,
    // We sort by occurrences desc primarily because the builder re-sorts by
    // severity anyway, and ordering by occurrences keeps the truncation
    // boundary predictable (loudest gaps always included).
    sort: [
      { occurrences: { order: 'desc', unmapped_type: 'long' } },
      { '@timestamp': { order: 'desc', unmapped_type: 'date' } },
    ],
    _source: true,
    track_total_hits: false,
    query: {
      range: { '@timestamp': { gte: WINDOW_MAP[window] } },
    },
  });

  const hits = res.hits?.hits ?? [];
  const out: RawCoverageHit[] = [];
  for (const hit of hits) {
    if (hit._source) {
      out.push({ doc_id: String(hit._id ?? ''), source: hit._source });
    }
  }
  return out;
};
