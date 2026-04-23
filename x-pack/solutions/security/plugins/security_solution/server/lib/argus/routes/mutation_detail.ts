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
  MUTATION_DETAIL_ROUTE,
  buildMutationDetail,
  buildSynthesisProposals,
  type ArgusMutationDetailResponse,
  type ArgusSynthesisResponse,
  type DetailRawAdvisoryDoc,
  type DetailRawBacktestDoc,
  type DetailRawMutationIntentDoc,
  type DetailRawOutcomeDoc,
  type SynthesisRawAdvisoryDoc,
  type SynthesisRawRecommendationDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';
import { fetchPostApplyObservation } from '../fetch_post_apply_observation';

const querySchema = schema.object({
  mutation_intent_id: schema.string({ minLength: 1, maxLength: 1024 }),
});

/**
 * Fetch the intent doc. We match on either `mutation_intent_id` (the
 * canonical field the seed + live scripts set) or the ES `_id` because
 * older fixtures rely on `_id` and the UI shouldn't care which is which.
 *
 * `mutation_intent_id` is dynamically mapped as `text` with a `.keyword`
 * subfield on several `.soc-*` indices, so a bare `term` query silently
 * misses on IDs containing dashes (e.g. `mut-mttr-000`). We query the
 * `.keyword` subfield and also fall back to `match_phrase` on the parent
 * field for older mappings where the multi-field was dropped. The same
 * tolerance is already used by `mutation_lineage` and `mutation_verdict`.
 */
const findIntent = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string
): Promise<DetailRawMutationIntentDoc | undefined> => {
  try {
    const res = await esClient.search<DetailRawMutationIntentDoc>({
      index: ARGUS_SOC_INDICES.mutationIntents,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            { term: { _id: mutationIntentId } },
            { term: { 'mutation_intent_id.keyword': mutationIntentId } },
            { match_phrase: { mutation_intent_id: mutationIntentId } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    return hit?._source ?? undefined;
  } catch {
    return undefined;
  }
};

const findOutcome = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string
): Promise<DetailRawOutcomeDoc | undefined> => {
  try {
    const res = await esClient.search<DetailRawOutcomeDoc>({
      index: ARGUS_SOC_INDICES.outcomes,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            { term: { _id: mutationIntentId } },
            { term: { 'mutation_intent_id.keyword': mutationIntentId } },
            { match_phrase: { mutation_intent_id: mutationIntentId } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    return hit?._source ?? undefined;
  } catch {
    return undefined;
  }
};

const findAdvisory = async (
  esClient: ElasticsearchClient,
  advisoryId: string | null | undefined
): Promise<SynthesisRawAdvisoryDoc | undefined> => {
  if (!advisoryId) return undefined;
  try {
    const res = await esClient.search<SynthesisRawAdvisoryDoc['_source']>({
      index: ARGUS_SOC_INDICES.cveAdvisories,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            { term: { _id: advisoryId } },
            { term: { advisory_id: advisoryId } },
            { term: { cve_id: advisoryId } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    if (!hit || !hit._id) return undefined;
    return { _id: hit._id, _source: hit._source };
  } catch {
    return undefined;
  }
};

const findRecommendation = async (
  esClient: ElasticsearchClient,
  recommendationId: string | null | undefined,
  ruleId: string | null | undefined
): Promise<SynthesisRawRecommendationDoc | undefined> => {
  if (!recommendationId && !ruleId) return undefined;
  try {
    const res = await esClient.search<SynthesisRawRecommendationDoc['_source']>({
      index: ARGUS_SOC_INDICES.recommendations,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            ...(recommendationId
              ? [{ term: { _id: recommendationId } }, { term: { rec_id: recommendationId } }]
              : []),
            ...(ruleId ? [{ term: { rule_id: ruleId } }] : []),
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    if (!hit || !hit._id) return undefined;
    return { _id: hit._id, _source: hit._source };
  } catch {
    return undefined;
  }
};

const findBacktest = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string,
  ruleId: string | null | undefined
): Promise<DetailRawBacktestDoc | undefined> => {
  try {
    const res = await esClient.search<DetailRawBacktestDoc>({
      index: ARGUS_SOC_INDICES.backtestResults,
      ignore_unavailable: true,
      size: 1,
      // Newest backtest wins — we assume re-runs are authoritative over
      // the preview baked into the intent.
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            { term: { 'mutation_intent_id.keyword': mutationIntentId } },
            { match_phrase: { mutation_intent_id: mutationIntentId } },
            ...(ruleId ? [{ term: { rule_id: ruleId } }] : []),
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    return hit?._source ?? undefined;
  } catch {
    return undefined;
  }
};

export const registerMutationDetailRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: MUTATION_DETAIL_ROUTE,
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
        const mutationIntentId = request.query.mutation_intent_id;

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          // Intent + outcome in parallel — either (or both) may be
          // missing. The builder resolves verdict from whichever side
          // has data.
          const [intent, outcome] = await Promise.all([
            findIntent(esClient, mutationIntentId),
            findOutcome(esClient, mutationIntentId),
          ]);

          if (!intent && !outcome) {
            const body: ArgusMutationDetailResponse = {
              reason_code: 'not_found',
              detail: null,
            };
            return response.ok({ body });
          }

          // Advisory + backtest + recommendation in parallel. The
          // recommendation feeds the shared synthesis builder so the
          // flyout reuses the Pareto rendering from the Proposals tab.
          const ruleId = intent?.rule_id ?? outcome?.rule_id ?? null;
          const advisoryId = intent?.advisory_id ?? null;
          const recommendationId = intent?.recommendation_id ?? null;

          const [advisory, backtest, postApplyObservation] = await Promise.all([
            findAdvisory(esClient, advisoryId),
            findBacktest(esClient, mutationIntentId, ruleId),
            fetchPostApplyObservation({
              esClient,
              logger,
              outcome,
              ruleId,
              mutationIntentId,
            }),
          ]);

          const recommendation = await findRecommendation(esClient, recommendationId, ruleId);

          let synthesis: ArgusSynthesisResponse | null = null;
          if (advisory) {
            synthesis = buildSynthesisProposals({
              cveId: advisory._source?.cve_id ?? advisoryId ?? mutationIntentId,
              advisoryDoc: advisory,
              recommendationDoc: recommendation,
            });
          }

          const advisorySource = advisory
            ? ({
                ...(advisory._source ?? {}),
                _id: advisory._id,
              } as DetailRawAdvisoryDoc)
            : undefined;

          const body = buildMutationDetail({
            mutationIntentId,
            intent,
            outcome,
            advisory: advisorySource,
            backtest,
            synthesis,
            postApplyObservation,
          });

          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus mutation_detail route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};
