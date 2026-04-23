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
  SYNTHESIS_PROPOSALS_ROUTE,
  buildSynthesisProposals,
  type ArgusSynthesisResponse,
  type SynthesisRawAdvisoryDoc,
  type SynthesisRawRecommendationDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

const querySchema = schema.object({
  cve: schema.string({ minLength: 1, maxLength: 1024 }),
});

const findAdvisory = async (
  esClient: ElasticsearchClient,
  cveQuery: string
): Promise<SynthesisRawAdvisoryDoc | undefined> => {
  try {
    const res = await esClient.search<SynthesisRawAdvisoryDoc['_source']>({
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
    return { _id: hit._id, _source: hit._source };
  } catch {
    return undefined;
  }
};

const findRecommendation = async (
  esClient: ElasticsearchClient,
  ruleId: string | undefined,
  recId: string | undefined
): Promise<SynthesisRawRecommendationDoc | undefined> => {
  if (!ruleId && !recId) return undefined;
  try {
    const res = await esClient.search<SynthesisRawRecommendationDoc['_source']>({
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
    return { _id: hit._id, _source: hit._source };
  } catch {
    return undefined;
  }
};

export const registerSynthesisProposalsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: SYNTHESIS_PROPOSALS_ROUTE,
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

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          const advisory = await findAdvisory(esClient, cveQuery);
          const cveId = advisory?._source?.cve_id ?? cveQuery;

          if (!advisory) {
            const body: ArgusSynthesisResponse = buildSynthesisProposals({ cveId });
            return response.ok({ body });
          }

          const recommendationId = advisory._source?.recommendation_id;
          const draftRuleId = advisory._source?.draft_rule_id;
          const recommendation = await findRecommendation(esClient, draftRuleId, recommendationId);

          const body: ArgusSynthesisResponse = buildSynthesisProposals({
            cveId,
            advisoryDoc: advisory,
            recommendationDoc: recommendation,
          });

          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus synthesis_proposals route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};
