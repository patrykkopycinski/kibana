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
  RECENT_PROPOSALS_ROUTE,
  buildRecentProposals,
  type ArgusSynthesisRecentResponse,
  type ArgusSynthesisWindow,
  type SynthesisRawAdvisoryDoc,
  type SynthesisRawRecommendationDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

const WINDOW_MAP: Record<ArgusSynthesisWindow, string> = {
  '24h': 'now-24h',
  '7d': 'now-7d',
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const querySchema = schema.object({
  window: schema.maybe(schema.oneOf([schema.literal('24h'), schema.literal('7d')])),
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
});

/**
 * Hydrate advisories for a set of recommendation ids, keyed by
 * recommendation_id so the builder can join in a single pass. A missing
 * advisory is fine — the builder emits `cve_id=unknown` for that row, which
 * is a useful "orphan recommendation" signal rather than an error.
 */
const fetchAdvisoriesByRecommendationId = async (
  esClient: ElasticsearchClient,
  recommendationIds: readonly string[]
): Promise<ReadonlyMap<string, SynthesisRawAdvisoryDoc>> => {
  if (recommendationIds.length === 0) return new Map();
  try {
    const res = await esClient.search<SynthesisRawAdvisoryDoc['_source']>({
      index: ARGUS_SOC_INDICES.cveAdvisories,
      ignore_unavailable: true,
      size: recommendationIds.length,
      query: { terms: { recommendation_id: recommendationIds as string[] } },
    });
    const map = new Map<string, SynthesisRawAdvisoryDoc>();
    for (const hit of res.hits?.hits ?? []) {
      const recId = hit._source?.recommendation_id;
      if (typeof recId === 'string' && recId.length > 0) {
        map.set(recId, { _id: hit._id, _source: hit._source });
      }
    }
    return map;
  } catch {
    return new Map();
  }
};

export const registerRecentProposalsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: RECENT_PROPOSALS_ROUTE,
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
        const windowKey: ArgusSynthesisWindow = request.query.window ?? '24h';
        const limit = request.query.limit ?? DEFAULT_LIMIT;

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          // Only pull recommendations that actually carry `argus.synthesis`.
          // Using `exists` on the chosen candidate is the tightest filter we
          // can apply without assuming a specific rec schema.
          const recRes = await esClient.search<SynthesisRawRecommendationDoc['_source']>({
            index: ARGUS_SOC_INDICES.recommendations,
            ignore_unavailable: true,
            size: limit,
            sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
            query: {
              bool: {
                filter: [
                  { range: { '@timestamp': { gte: WINDOW_MAP[windowKey] } } },
                  { exists: { field: 'argus.synthesis.chosen.candidate_id' } },
                ],
              },
            },
          });

          const recHits = recRes.hits?.hits ?? [];
          const recDocs: SynthesisRawRecommendationDoc[] = recHits.map((h) => ({
            _id: h._id,
            _source: h._source,
          }));

          const recommendationIds = recDocs
            .map((d) => d._id)
            .filter((v): v is string => typeof v === 'string' && v.length > 0);
          const advisoryByRecommendationId = await fetchAdvisoriesByRecommendationId(
            esClient,
            recommendationIds
          );

          const body: ArgusSynthesisRecentResponse = buildRecentProposals({
            window: windowKey,
            recommendations: recDocs,
            advisoryByRecommendationId,
          });

          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus recent_proposals route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};
