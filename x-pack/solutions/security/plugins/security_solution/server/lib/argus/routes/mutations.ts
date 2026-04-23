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
  MUTATIONS_ROUTE,
  buildMutations,
  type ArgusMutationFilter,
  type ArgusMutationWindow,
  type RawMutationIntentDoc,
  type RawOutcomeDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

/**
 * Max rows we'll pull from each index in a single call. The UI caps at
 * `DEFAULT_LIMIT` but we fetch slightly more so the counts tiles reflect a
 * wider sample than the visible table. Hard ceiling of `MAX_LIMIT` prevents
 * a pathological caller from asking for 10,000 rows.
 */
const PER_INDEX_SIZE = 500;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Closed set of windows. Mirrors `ArgusMutationWindow` from the common
 * package. Keeping this closed (instead of `gte`/`lte` date-math strings)
 * makes the UI toggle + server contract unambiguously in sync.
 */
const WINDOW_MAP: Record<ArgusMutationWindow, string> = {
  '24h': 'now-24h',
  '7d': 'now-7d',
};
const DEFAULT_WINDOW: ArgusMutationWindow = '24h';

const FILTER_VALUES = [
  'applied',
  'rolled_back',
  'blocked',
  'all',
] as const satisfies readonly ArgusMutationFilter[];
const WINDOW_VALUES = ['24h', '7d'] as const satisfies readonly ArgusMutationWindow[];

const querySchema = schema.object({
  filter: schema.maybe(
    schema.oneOf([
      schema.literal(FILTER_VALUES[0]),
      schema.literal(FILTER_VALUES[1]),
      schema.literal(FILTER_VALUES[2]),
      schema.literal(FILTER_VALUES[3]),
    ])
  ),
  window: schema.maybe(
    schema.oneOf([schema.literal(WINDOW_VALUES[0]), schema.literal(WINDOW_VALUES[1])])
  ),
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
});

export const registerMutationsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: MUTATIONS_ROUTE,
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
        const filter: ArgusMutationFilter = request.query.filter ?? 'all';
        const windowKey: ArgusMutationWindow = request.query.window ?? DEFAULT_WINDOW;
        const windowStart = WINDOW_MAP[windowKey];
        const windowEnd = 'now';
        const limit = request.query.limit ?? DEFAULT_LIMIT;

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          // Two parallel searches, one per surface. `ignore_unavailable:true`
          // keeps cold-start clusters from 404'ing the whole tab when a
          // stream template hasn't been materialised yet.
          const [outcomesSettled, blockedSettled] = await Promise.allSettled([
            esClient.search<Record<string, unknown>>({
              index: ARGUS_SOC_INDICES.outcomes,
              ignore_unavailable: true,
              size: PER_INDEX_SIZE,
              track_total_hits: true,
              sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
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
              _source: [
                '@timestamp',
                'mutation_intent_id',
                'rule_id',
                'rolled_back',
                'rollback_mttr_ms',
                'rollback_reason',
                'applied_at',
                'rolled_back_at',
                'actor_id',
                'actor_trust_tier',
                'title',
                'label',
                'subtitle',
              ],
            }),
            esClient.search<Record<string, unknown>>({
              index: ARGUS_SOC_INDICES.mutationIntents,
              ignore_unavailable: true,
              size: PER_INDEX_SIZE,
              track_total_hits: true,
              sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
              query: {
                bool: {
                  filter: [
                    {
                      range: {
                        '@timestamp': { gte: windowStart, lte: windowEnd },
                      },
                    },
                    // `term` on the plain field works here because the ES
                    // analyzer tokenises a single lowercase word to itself;
                    // verified against the live cluster. We use the plain
                    // field (not `.keyword`) to stay consistent with how the
                    // governance-pulse route filters on the same field.
                    { term: { 'governance_gate.status': 'blocked' } },
                  ],
                },
              },
              _source: [
                '@timestamp',
                'mutation_intent_id',
                'rule_id',
                'title',
                'label',
                'subtitle',
                'actor_id',
                'actor_trust_tier',
                'governance_gate',
              ],
            }),
          ]);

          if (outcomesSettled.status === 'rejected') {
            logger.debug(
              `ARGUS mutations route: outcomes query failed — ${String(outcomesSettled.reason)}`
            );
          }
          if (blockedSettled.status === 'rejected') {
            logger.debug(
              `ARGUS mutations route: blocked-intents query failed — ${String(
                blockedSettled.reason
              )}`
            );
          }

          const outcomes: RawOutcomeDoc[] =
            outcomesSettled.status === 'fulfilled'
              ? (outcomesSettled.value.hits.hits
                  .map((h) => h._source)
                  .filter((s): s is Record<string, unknown> => Boolean(s)) as RawOutcomeDoc[])
              : [];

          const blockedIntents: RawMutationIntentDoc[] =
            blockedSettled.status === 'fulfilled'
              ? (blockedSettled.value.hits.hits
                  .map((h) => h._source)
                  .filter((s): s is Record<string, unknown> =>
                    Boolean(s)
                  ) as RawMutationIntentDoc[])
              : [];

          // `track_total_hits: true` gives us the real server-side row count
          // (capped at the 10k index default) so the UI can show a truthful
          // "showing N of M" even when the merged in-memory list is shorter
          // than the true cardinality.
          const totalMatched =
            safeTotal(outcomesSettled) +
            (filter === 'all' || filter === 'blocked' ? safeTotal(blockedSettled) : 0);

          const payload = buildMutations({
            windowStart,
            windowEnd,
            filter,
            outcomes,
            blockedIntents,
            limit,
            totalMatched,
          });

          return response.ok({ body: payload });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS mutations route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

const safeTotal = (
  settled: PromiseSettledResult<{
    readonly hits?: { readonly total?: number | { readonly value?: number } };
  }>
): number => {
  if (settled.status !== 'fulfilled') return 0;
  const total = settled.value.hits?.total;
  if (typeof total === 'number') return total;
  if (typeof total === 'object' && total !== null) return total.value ?? 0;
  return 0;
};
