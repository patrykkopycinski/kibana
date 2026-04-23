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
  E2D_RECENT_CVES_ROUTE,
  type ArgusE2dRecentCve,
  type ArgusE2dRecentCvesResponse,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const querySchema = schema.object({
  kev_only: schema.maybe(schema.boolean()),
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
});

interface AdvisorySource {
  readonly advisory_id?: string;
  readonly cve_id?: string;
  readonly title?: string;
  readonly severity?: string;
  readonly status?: string;
  readonly '@timestamp'?: string;
  readonly published_at?: string;
  readonly draft_rule_id?: string;
  readonly kev?: Readonly<Record<string, unknown>> | null;
}

const toStringOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length === 0) return null;
  return v;
};

export const registerE2dRecentCvesRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: E2D_RECENT_CVES_ROUTE,
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
        const kevOnly = Boolean(request.query.kev_only);
        const limit = request.query.limit ?? DEFAULT_LIMIT;

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          // Fetch slightly more than `limit` so we can surface a `truncated`
          // signal without paying for an extra round-trip.
          const fetchSize = Math.min(limit + 1, MAX_LIMIT + 1);

          const advisoryRes = await esClient.search<AdvisorySource>({
            index: ARGUS_SOC_INDICES.cveAdvisories,
            ignore_unavailable: true,
            size: fetchSize,
            sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
            query: kevOnly ? { exists: { field: 'kev' } } : { match_all: {} },
          });

          const rawHits = advisoryRes.hits?.hits ?? [];
          const hits = rawHits.slice(0, limit);
          const truncated = rawHits.length > limit;

          // Once we know which advisories we're surfacing, check which of
          // them have an active mutation_intent. This is a single aggregated
          // query across all the matching `draft_rule_id`s so we avoid
          // N-queries in the hot path.
          const ruleIds = hits
            .map((h) => toStringOrNull(h._source?.draft_rule_id))
            .filter((v): v is string => v !== null);

          const intentRuleIds = new Set<string>();
          if (ruleIds.length > 0) {
            try {
              const intentsRes = await esClient.search<{ rule_id?: string }>({
                index: ARGUS_SOC_INDICES.mutationIntents,
                ignore_unavailable: true,
                size: 0,
                query: { terms: { rule_id: ruleIds } },
                aggs: {
                  by_rule: { terms: { field: 'rule_id', size: ruleIds.length } },
                },
              });
              const buckets = (
                intentsRes.aggregations as
                  | {
                      by_rule?: { buckets?: ReadonlyArray<{ key?: string }> };
                    }
                  | undefined
              )?.by_rule?.buckets;
              buckets?.forEach((b) => {
                if (typeof b.key === 'string') intentRuleIds.add(b.key);
              });
            } catch (aggErr) {
              logger.debug(`Argus e2d_recent_cves: intents aggregation failed — ${String(aggErr)}`);
            }
          }

          const items: ArgusE2dRecentCve[] = hits.map((hit) => {
            const src = hit._source ?? {};
            const advisoryId = toStringOrNull(src.advisory_id) ?? hit._id ?? '';
            const draftRuleId = toStringOrNull(src.draft_rule_id);
            return {
              advisory_id: advisoryId,
              cve_id: toStringOrNull(src.cve_id) ?? advisoryId,
              title: toStringOrNull(src.title),
              severity: toStringOrNull(src.severity),
              status: toStringOrNull(src.status),
              kev: Boolean(src.kev),
              ingested_at: toStringOrNull(src['@timestamp']) ?? toStringOrNull(src.published_at),
              draft_rule_id: draftRuleId,
              has_mutation_intent: draftRuleId ? intentRuleIds.has(draftRuleId) : false,
            };
          });

          const body: ArgusE2dRecentCvesResponse = {
            items,
            kev_only: kevOnly,
            truncated,
          };

          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus e2d_recent_cves route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};
