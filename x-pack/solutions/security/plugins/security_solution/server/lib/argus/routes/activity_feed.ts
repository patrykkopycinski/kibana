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
  ACTIVITY_FEED_ROUTE,
  ARGUS_SOC_INDICES,
  buildActivityFeed,
  type ActivityFeedFilters,
  type ActivityLayer,
  type RawActivityHit,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

/**
 * One query per layer, fanned out in parallel. Each query is tolerant of the
 * index being missing (`ignore_unavailable`) so cold-start clusters still
 * produce *something* on the feed.
 *
 * Keep the per-layer `size` small — the UI trims to 50 anyway and running a
 * 5-way fan-out with 200-row pages would be expensive.
 */
const PER_LAYER_SIZE = 30;

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const querySchema = schema.object({
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
  layers: schema.maybe(schema.string({ minLength: 1, maxLength: 256 })),
  pressure: schema.maybe(schema.string({ minLength: 1, maxLength: 128 })),
  actorIds: schema.maybe(schema.string({ minLength: 1, maxLength: 512 })),
  trustTiers: schema.maybe(schema.string({ minLength: 1, maxLength: 256 })),
});

export const registerActivityFeedRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: ACTIVITY_FEED_ROUTE,
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

          const filters: ActivityFeedFilters = {
            layers: parseJsonArrayParam<ActivityLayer>(request.query.layers) ?? undefined,
            pressure:
              parseJsonArrayParam<NonNullable<ActivityFeedFilters['pressure']>[number]>(
                request.query.pressure
              ) ?? undefined,
            actorIds: parseJsonArrayParam<string>(request.query.actorIds) ?? undefined,
            trustTiers: parseJsonArrayParam<string>(request.query.trustTiers) ?? undefined,
            limit: request.query.limit,
          };

          const hits = await fanOutActivityHits(esClient, filters);

          const feed = buildActivityFeed({
            hits,
            filters,
            limit: filters.limit ?? DEFAULT_LIMIT,
          });

          return response.ok({ body: feed });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS activity_feed route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

/**
 * Parse a repeatable query param shipped as a JSON-encoded array. We pick
 * JSON encoding over comma-joined strings so values with commas (unlikely
 * here, but possible for `actorIds`) round-trip cleanly.
 *
 * Also accepts a plain comma-delimited string for ergonomics when somebody
 * pokes the route from curl.
 */
const parseJsonArrayParam = <T extends string>(value: string | undefined): readonly T[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is T => typeof v === 'string' && v.length > 0);
    }
  } catch {
    // Fall through to the comma-split fallback.
  }
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? (parts as T[]) : null;
};

interface LayerQueryConfig {
  readonly layer: ActivityLayer;
  readonly index: string;
  readonly query?: Record<string, unknown>;
}

/**
 * Per-layer index routing. Each layer reads from one or more `.soc-*` indices.
 * The activity feed doesn't know about `_index` for the source document, so
 * we stamp the hit with the configured `index` on the way out.
 */
const LAYER_QUERIES: readonly LayerQueryConfig[] = [
  { layer: 'telemetry', index: ARGUS_SOC_INDICES.telemetrySignals },
  {
    layer: 'detection',
    index: ARGUS_SOC_INDICES.detectionEvalRuns,
    query: { term: { run_kind: 'detection' } },
  },
  { layer: 'mutation', index: ARGUS_SOC_INDICES.mutationIntents },
  { layer: 'response', index: ARGUS_SOC_INDICES.recommendations },
  { layer: 'response', index: ARGUS_SOC_INDICES.outcomes },
  { layer: 'governance', index: ARGUS_SOC_INDICES.actorTrustTiers },
  { layer: 'governance', index: ARGUS_SOC_INDICES.backtestResults },
];

const fanOutActivityHits = async (
  esClient: ElasticsearchClient,
  filters: ActivityFeedFilters
): Promise<readonly RawActivityHit[]> => {
  // Only query layers the caller asked about — reduces load when the UI
  // collapses to "just mutation" view.
  const layerFilter = filters.layers && filters.layers.length > 0 ? new Set(filters.layers) : null;
  const enabledQueries = LAYER_QUERIES.filter((q) => !layerFilter || layerFilter.has(q.layer));

  const responses = await Promise.allSettled(
    enabledQueries.map((q) =>
      esClient.search<Record<string, unknown>>({
        index: q.index,
        ignore_unavailable: true,
        size: PER_LAYER_SIZE,
        query: q.query ?? { match_all: {} },
        sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
        _source: true,
        track_total_hits: false,
      })
    )
  );

  const out: RawActivityHit[] = [];
  responses.forEach((settled, idx) => {
    const config = enabledQueries[idx];
    if (settled.status !== 'fulfilled') return;
    const hits = settled.value.hits?.hits ?? [];
    for (const hit of hits) {
      if (hit._source) {
        out.push({
          layer: config.layer,
          index: config.index,
          doc_id: String(hit._id ?? ''),
          source: hit._source as Record<string, unknown>,
        });
      }
    }
  });

  return out;
};
