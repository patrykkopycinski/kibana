/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import {
  ARGUS_SOC_INDICES,
  buildMutationDetail,
  type DetailRawAdvisoryDoc,
  type DetailRawBacktestDoc,
  type DetailRawMutationIntentDoc,
  type DetailRawOutcomeDoc,
} from '@kbn/argus-console-common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_GET_MUTATION_DETAIL_TOOL_ID } from './constants';

const getMutationDetailSchema = z.object({
  mutation_intent_id: z
    .string()
    .min(1)
    .max(1024)
    .describe(
      'Either the canonical `mutation_intent_id` (preferred) or the underlying ES `_id`. Both are accepted.'
    ),
});

/**
 * Thin LLM-callable wrapper over the existing `buildMutationDetail` builder.
 * Reads the intent + outcome + advisory + backtest docs directly and reuses
 * the shared builder so the tool surface matches what the Console flyout
 * renders — no contract drift.
 */
export function argusGetMutationDetailTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof getMutationDetailSchema> {
  return {
    id: ARGUS_GET_MUTATION_DETAIL_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Fetch the full Argus mutation detail payload (intent + outcome + advisory + backtest + ' +
      'synthesis summary) for a given mutation_intent_id. Read-only. Returns `reason_code: ' +
      '"not_found"` if neither an intent nor an outcome exists for the id.',
    schema: getMutationDetailSchema,
    tags: ['security', 'argus', 'argus:playbook', 'read', 'mutation'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) =>
        getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ mutation_intent_id: mutationIntentId }, { esClient }) => {
      try {
        const es = esClient.asCurrentUser;

        const matchOnIntentIds = {
          bool: {
            should: [
              { term: { _id: mutationIntentId } },
              { term: { mutation_intent_id: mutationIntentId } },
            ],
            minimum_should_match: 1,
          },
        };

        const [intentRes, outcomeRes] = await Promise.all([
          es.search<DetailRawMutationIntentDoc>({
            index: ARGUS_SOC_INDICES.mutationIntents,
            size: 1,
            sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
            query: matchOnIntentIds,
            ignore_unavailable: true,
          }),
          es.search<DetailRawOutcomeDoc>({
            index: ARGUS_SOC_INDICES.outcomes,
            size: 1,
            sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
            query: matchOnIntentIds,
            ignore_unavailable: true,
          }),
        ]);

        const intent = intentRes.hits.hits[0]?._source;
        const outcome = outcomeRes.hits.hits[0]?._source;

        if (!intent && !outcome) {
          return {
            results: [
              {
                type: ToolResultType.other,
                data: {
                  message: `No mutation intent or outcome found for id=${mutationIntentId}.`,
                  reason_code: 'not_found',
                  detail: null,
                },
              },
            ],
          };
        }

        const ruleId = intent?.rule_id ?? outcome?.rule_id ?? null;
        const advisoryId = intent?.advisory_id ?? null;

        const [advisoryHit, backtestHit] = await Promise.all([
          advisoryId
            ? es
                .search<DetailRawAdvisoryDoc>({
                  index: ARGUS_SOC_INDICES.cveAdvisories,
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
                  ignore_unavailable: true,
                })
                .then((r) => r.hits.hits[0])
            : Promise.resolve(undefined),
          es
            .search<DetailRawBacktestDoc>({
              index: ARGUS_SOC_INDICES.backtestResults,
              size: 1,
              sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
              query: {
                bool: {
                  should: [
                    { term: { mutation_intent_id: mutationIntentId } },
                    ...(ruleId ? [{ term: { rule_id: ruleId } }] : []),
                  ],
                  minimum_should_match: 1,
                },
              },
              ignore_unavailable: true,
            })
            .then((r) => r.hits.hits[0]),
        ]);

        const advisorySource: DetailRawAdvisoryDoc | undefined = advisoryHit
          ? ({ ...(advisoryHit._source ?? {}), _id: advisoryHit._id } as DetailRawAdvisoryDoc)
          : undefined;

        const detail = buildMutationDetail({
          mutationIntentId,
          intent,
          outcome,
          advisory: advisorySource,
          backtest: backtestHit?._source,
          synthesis: null,
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Mutation detail for id=${mutationIntentId} (reason_code=${detail.reason_code}).`,
                reason_code: detail.reason_code,
                detail: detail.detail,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.get_mutation_detail failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch mutation detail: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            },
          ],
        };
      }
    },
  };
}
