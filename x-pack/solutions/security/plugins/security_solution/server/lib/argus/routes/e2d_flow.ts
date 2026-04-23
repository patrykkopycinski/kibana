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
  E2D_FLOW_ROUTE,
  buildE2dFlow,
  type E2dRawAdvisoryDoc,
  type E2dRawBacktestDoc,
  type E2dRawEvalRunDoc,
  type E2dRawMutationIntentDoc,
  type E2dRawOutcomeDoc,
  type E2dRawRecommendationDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

const WINDOW_MAP = {
  '24h': 'now-24h',
  '7d': 'now-7d',
} as const;
type WindowKey = keyof typeof WINDOW_MAP;

const ALERTS_INDEX_PATTERN = '.alerts-security.alerts-*';

const querySchema = schema.object({
  cve: schema.string({ minLength: 1, maxLength: 1024 }),
  window: schema.maybe(schema.oneOf([schema.literal('24h'), schema.literal('7d')])),
});

/**
 * Find the most recent CVE advisory that matches the query string. We accept
 * either the `cve_id` (e.g. `CVE-2025-12345`), the `advisory_id`, or the
 * document `_id` — whichever the caller has on hand.
 */
const findAdvisory = async (
  esClient: ElasticsearchClient,
  cveQuery: string
): Promise<E2dRawAdvisoryDoc | undefined> => {
  try {
    const res = await esClient.search<E2dRawAdvisoryDoc['_source']>({
      index: ARGUS_SOC_INDICES.cveAdvisories,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            { term: { _id: cveQuery } },
            { term: { advisory_id: cveQuery } },
            { term: { cve_id: cveQuery } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    if (!hit || !hit._id) return undefined;
    return { _id: hit._id, _index: hit._index, _source: hit._source };
  } catch {
    return undefined;
  }
};

const findRecommendation = async (
  esClient: ElasticsearchClient,
  ruleId: string | undefined,
  recId: string | undefined
): Promise<E2dRawRecommendationDoc | undefined> => {
  if (!ruleId && !recId) return undefined;
  try {
    const res = await esClient.search<E2dRawRecommendationDoc['_source']>({
      index: ARGUS_SOC_INDICES.recommendations,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            ...(recId ? [{ term: { _id: recId } }, { term: { rec_id: recId } }] : []),
            ...(ruleId ? [{ term: { rule_id: ruleId } }] : []),
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    if (!hit || !hit._id) return undefined;
    return { _id: hit._id, _index: hit._index, _source: hit._source };
  } catch {
    return undefined;
  }
};

const findMutationIntent = async (
  esClient: ElasticsearchClient,
  ruleId: string | undefined
): Promise<E2dRawMutationIntentDoc | undefined> => {
  if (!ruleId) return undefined;
  try {
    const res = await esClient.search<E2dRawMutationIntentDoc['_source']>({
      index: ARGUS_SOC_INDICES.mutationIntents,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: { term: { rule_id: ruleId } },
    });
    const hit = res.hits?.hits?.[0];
    if (!hit || !hit._id) return undefined;
    return { _id: hit._id, _index: hit._index, _source: hit._source };
  } catch {
    return undefined;
  }
};

const findByRuleId = async <T extends { readonly _source?: unknown }>(
  esClient: ElasticsearchClient,
  index: string,
  ruleId: string | undefined
): Promise<T | undefined> => {
  if (!ruleId) return undefined;
  try {
    const res = await esClient.search({
      index,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: { term: { rule_id: ruleId } },
    });
    const hit = res.hits?.hits?.[0];
    if (!hit || !hit._id) return undefined;
    return { _id: hit._id, _index: hit._index, _source: hit._source } as unknown as T;
  } catch {
    return undefined;
  }
};

/**
 * Count live detection hits for the synthesized rule over the requested
 * window. Uses `count` (not `search`) so we don't pay for doc bodies — the
 * UI only needs the cardinality. Alert docs carry the detection rule via
 * `kibana.alert.rule.rule_id` (the stable business id, not the SO id).
 */
const countLiveHits = async (
  esClient: ElasticsearchClient,
  ruleId: string | undefined,
  windowStart: string
): Promise<number> => {
  if (!ruleId) return 0;
  try {
    const res = await esClient.count({
      index: ALERTS_INDEX_PATTERN,
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [
            { range: { '@timestamp': { gte: windowStart, lte: 'now' } } },
            {
              bool: {
                should: [
                  { term: { 'kibana.alert.rule.rule_id': ruleId } },
                  { term: { 'kibana.alert.rule.name': ruleId } },
                  { term: { 'kibana.alert.argus.rule_id': ruleId } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    });
    return typeof res.count === 'number' ? res.count : 0;
  } catch {
    return 0;
  }
};

export const registerE2dFlowRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: E2D_FLOW_ROUTE,
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
        const cveQuery = request.query.cve;
        const windowKey: WindowKey = request.query.window ?? '24h';
        const windowStart = WINDOW_MAP[windowKey];

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          const advisory = await findAdvisory(esClient, cveQuery);

          if (!advisory) {
            return response.ok({
              body: buildE2dFlow({
                cveQuery,
                window: windowKey,
                advisory: undefined,
                mutationIntent: undefined,
                recommendation: undefined,
                evalRun: undefined,
                backtest: undefined,
                outcome: undefined,
                liveHitCount: 0,
              }),
            });
          }

          const ruleId = advisory._source?.draft_rule_id;
          const recId = advisory._source?.recommendation_id;

          // Fan-out — we only need `rule_id` to drive the rest, so these can
          // all run in parallel.
          const [recommendation, mutationIntent, evalRun, backtest, outcome, liveHitCount] =
            await Promise.all([
              findRecommendation(esClient, ruleId, recId),
              findMutationIntent(esClient, ruleId),
              findByRuleId<E2dRawEvalRunDoc>(esClient, ARGUS_SOC_INDICES.detectionEvalRuns, ruleId),
              findByRuleId<E2dRawBacktestDoc>(esClient, ARGUS_SOC_INDICES.backtestResults, ruleId),
              findByRuleId<E2dRawOutcomeDoc>(esClient, ARGUS_SOC_INDICES.outcomes, ruleId),
              countLiveHits(esClient, ruleId, windowStart),
            ]);

          const payload = buildE2dFlow({
            cveQuery,
            window: windowKey,
            advisory,
            mutationIntent,
            recommendation,
            evalRun,
            backtest,
            outcome,
            liveHitCount,
          });

          return response.ok({ body: payload });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus e2d_flow route failed for "${cveQuery}": ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};
