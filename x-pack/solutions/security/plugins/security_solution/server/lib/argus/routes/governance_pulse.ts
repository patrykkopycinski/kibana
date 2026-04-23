/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';

import {
  ARGUS_SOC_INDICES,
  GOVERNANCE_PULSE_ROUTE,
  buildGovernancePulse,
  type ActorTrustTiersAggsInput,
  type GovernancePulseAggsInput,
  type MutationIntentsAggsInput,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

/**
 * Accepted window inputs. We take ISO timestamps OR an Elasticsearch date-math
 * expression ("now-24h"). Defaults to a 24h lookback so the tile always shows
 * something even with no query params from the UI.
 */
const querySchema = schema.object({
  window_start: schema.maybe(schema.string({ minLength: 1, maxLength: 64 })),
  window_end: schema.maybe(schema.string({ minLength: 1, maxLength: 64 })),
});

const DEFAULT_WINDOW_START = 'now-24h';
const DEFAULT_WINDOW_END = 'now';

export const registerGovernancePulseRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: GOVERNANCE_PULSE_ROUTE,
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
        const windowStart = request.query.window_start ?? DEFAULT_WINDOW_START;
        const windowEnd = request.query.window_end ?? DEFAULT_WINDOW_END;

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          // Three independent searches fan out in parallel. Each is wrapped in
          // `Promise.allSettled` so a missing index (serverless cold start,
          // pre-M2.5 clusters) can't take down the whole Pulse tile.
          const [outcomesSettled, mutationSettled, trustSettled] = await Promise.allSettled([
            esClient.search({
              index: ARGUS_SOC_INDICES.outcomes,
              ignore_unavailable: true,
              size: 0,
              track_total_hits: false,
              query: {
                bool: {
                  filter: [
                    {
                      range: {
                        '@timestamp': { gte: windowStart, lte: windowEnd },
                      },
                    },
                  ],
                },
              },
              aggs: {
                outcomes_total: { value_count: { field: '@timestamp' } },
                rollback_count: {
                  filter: {
                    bool: {
                      filter: [
                        { term: { rolled_back: true } },
                        { exists: { field: 'rollback_mttr_ms' } },
                      ],
                    },
                  },
                  aggs: {
                    c: { value_count: { field: 'rollback_mttr_ms' } },
                  },
                },
                avg_mttr: { avg: { field: 'rollback_mttr_ms' } },
                mttr_percentiles: {
                  percentiles: { field: 'rollback_mttr_ms', percents: [50, 95] },
                },
              },
            }),
            esClient.search({
              index: ARGUS_SOC_INDICES.mutationIntents,
              ignore_unavailable: true,
              size: 0,
              track_total_hits: false,
              query: {
                bool: {
                  filter: [
                    {
                      range: {
                        '@timestamp': { gte: windowStart, lte: windowEnd },
                      },
                    },
                  ],
                },
              },
              aggs: {
                blocked_count: {
                  filter: { term: { 'governance_gate.status': 'blocked' } },
                },
                drift_open: {
                  filter: {
                    bool: {
                      filter: [
                        { term: { drift_detected: true } },
                        {
                          bool: {
                            must_not: [
                              { term: { drift_resolved: true } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
                drift_resolved: {
                  filter: {
                    bool: {
                      filter: [
                        { term: { drift_detected: true } },
                        { term: { drift_resolved: true } },
                      ],
                    },
                  },
                },
              },
            }),
            esClient.search({
              index: ARGUS_SOC_INDICES.actorTrustTiers,
              ignore_unavailable: true,
              size: 0,
              track_total_hits: false,
              aggs: {
                by_actor: {
                  terms: { field: 'actor_id', size: 500 },
                  aggs: {
                    latest: {
                      // Sort each actor's tier rows newest-first and take the
                      // top tier bucket; that is their "current" tier.
                      terms: {
                        field: 'tier',
                        size: 1,
                        order: { last_seen: 'desc' },
                      },
                      aggs: {
                        last_seen: { max: { field: '@timestamp' } },
                      },
                    },
                  },
                },
              },
            }),
          ]);

          const outcomesAggs =
            outcomesSettled.status === 'fulfilled'
              ? normaliseOutcomesAggs(outcomesSettled.value.aggregations)
              : null;
          const mutationAggs =
            mutationSettled.status === 'fulfilled'
              ? (mutationSettled.value.aggregations as unknown as MutationIntentsAggsInput | undefined) ?? null
              : null;
          const trustAggs =
            trustSettled.status === 'fulfilled'
              ? (trustSettled.value.aggregations as unknown as ActorTrustTiersAggsInput | undefined) ?? null
              : null;

          // Log (at debug) when a section failed — helps diagnose "why is my
          // drift tile empty" on a real cluster without shouting at users on
          // cold-start clusters where the index just doesn't exist yet.
          if (outcomesSettled.status === 'rejected') {
            logger.debug(`Argus pulse outcomes query failed: ${String(outcomesSettled.reason)}`);
          }
          if (mutationSettled.status === 'rejected') {
            logger.debug(
              `Argus pulse mutation-intents query failed: ${String(mutationSettled.reason)}`
            );
          }
          if (trustSettled.status === 'rejected') {
            logger.debug(`Argus pulse trust-tier query failed: ${String(trustSettled.reason)}`);
          }

          const result = buildGovernancePulse({
            windowStart,
            windowEnd,
            aggs: outcomesAggs,
            mutationAggs,
            trustAggs,
          });

          return response.ok({ body: result });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus governance_pulse route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

/**
 * The outcomes query uses a filter sub-aggregation for `rollback_count`, so
 * the raw payload nests the count under `rollback_count.c.value`. Flatten it
 * back to the builder's expected `rollback_count.value` shape.
 */
const normaliseOutcomesAggs = (
  raw: Record<string, unknown> | undefined
): GovernancePulseAggsInput | null => {
  if (!raw) return null;
  const filtered = raw as {
    outcomes_total?: { value?: number | null };
    rollback_count?: { c?: { value?: number | null } };
    avg_mttr?: { value?: number | null };
    mttr_percentiles?: {
      values?: { ['50.0']?: number | null; ['95.0']?: number | null } | null;
    };
  };
  return {
    outcomes_total: filtered.outcomes_total ?? null,
    rollback_count: { value: filtered.rollback_count?.c?.value ?? 0 },
    avg_mttr: filtered.avg_mttr ?? null,
    mttr_percentiles: filtered.mttr_percentiles ?? null,
  };
};
