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
  DECISION_GRAPH_RECENT_ROOTS_ROUTE,
  type DecisionGraphNodeKind,
  type DecisionGraphRecentRoot,
  type DecisionGraphRecentRootsResponse,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const NODE_KINDS: readonly DecisionGraphNodeKind[] = [
  'advisory',
  'intent',
  'outcome',
  'rule',
  'actor',
  'technique',
  'reasoning',
  'audit',
  'observation',
] as const;

const isNodeKind = (value: unknown): value is DecisionGraphNodeKind =>
  typeof value === 'string' && (NODE_KINDS as readonly string[]).includes(value);

const querySchema = schema.object({
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
});

/**
 * Shape of the `multi_terms` bucket we expect back from ES. Typed loosely
 * because the ES client returns `key_as_string` + `key` as tuples and the
 * metric aggs come back as generic records.
 */
interface MultiTermsBucket {
  readonly key?: ReadonlyArray<string | number>;
  readonly doc_count?: number;
  readonly latest_ts?: { readonly value_as_string?: string; readonly value?: number };
  readonly label?: {
    readonly hits?: {
      readonly hits?: ReadonlyArray<{
        readonly _source?: {
          readonly from_label?: string;
          readonly from_kind?: string;
          readonly from_id?: string;
        };
      }>;
    };
  };
}

interface MultiTermsAgg {
  readonly roots?: { readonly buckets?: readonly MultiTermsBucket[] };
}

export const registerDecisionGraphRecentRootsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: DECISION_GRAPH_RECENT_ROOTS_ROUTE,
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
        const limit = request.query.limit ?? DEFAULT_LIMIT;

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          // Aggregate on the outgoing side of every edge so every bucket is
          // guaranteed to have ≥1 outgoing edge — that means clicking the
          // resulting chip in the UI never lands on an empty neighborhood.
          //
          // `multi_terms` bundles `(from_kind, from_id)` into a single bucket
          // key. The inner `latest_ts` metric is used both for bucket
          // ordering and for the `last_evidence_ts` field we surface to the
          // UI. `top_hits(size: 1, sort desc)` gives us the freshest
          // `from_label` so the chip reads e.g. "CVE-2024-27198" instead of
          // "advisory:argus-adv-…".
          const res = await esClient.search({
            index: ARGUS_SOC_INDICES.decisionGraph,
            ignore_unavailable: true,
            size: 0,
            track_total_hits: false,
            aggs: {
              roots: {
                multi_terms: {
                  terms: [{ field: 'from_kind' }, { field: 'from_id' }],
                  size: limit,
                  order: { latest_ts: 'desc' },
                },
                aggs: {
                  latest_ts: { max: { field: '@timestamp' } },
                  label: {
                    top_hits: {
                      size: 1,
                      _source: ['from_label', 'from_kind', 'from_id'],
                      sort: [{ '@timestamp': { order: 'desc' } }],
                    },
                  },
                },
              },
            },
          });

          const buckets = (res.aggregations as MultiTermsAgg | undefined)?.roots?.buckets ?? [];

          const items: DecisionGraphRecentRoot[] = [];
          for (const bucket of buckets) {
            const rawKind = bucket.key?.[0];
            const rawId = bucket.key?.[1];
            if (isNodeKind(rawKind) && typeof rawId === 'string' && rawId.length > 0) {
              const topHitSource = bucket.label?.hits?.hits?.[0]?._source;
              const rawLabel = topHitSource?.from_label;
              const label = typeof rawLabel === 'string' && rawLabel.length > 0 ? rawLabel : rawId;

              items.push({
                kind: rawKind,
                id: rawId,
                label,
                edge_count: typeof bucket.doc_count === 'number' ? bucket.doc_count : 0,
                last_evidence_ts: bucket.latest_ts?.value_as_string,
              });
            }
          }

          const body: DecisionGraphRecentRootsResponse = { items };
          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus decision_graph/recent_roots route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};
