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
import { ARGUS_SOC_INDICES } from '@kbn/argus-console-common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_SUMMARIZE_COVERAGE_TOOL_ID } from './constants';

const summarizeCoverageSchema = z.object({
  threat_profile_id: z
    .string()
    .optional()
    .describe('Optional threat-profile filter (Tier 1 concept). Defaults to "all profiles".'),
  top_n_gaps: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('How many gap rows to return. Ordered by severity desc, then by coverage asc.'),
});

interface CoverageGapDoc {
  '@timestamp'?: string;
  technique_id?: string;
  technique_name?: string;
  severity?: string;
  confidence?: number;
  rule_count?: number;
  note?: string;
}

/**
 * Read-only aggregate view over `.soc-coverage-gaps`. Not a new index — just a
 * summary layer the playbook skills can chain off. The spec for Tier 1 promotes
 * this into a dedicated coverage panel; in Phase A we expose the summary as a
 * tool so skills can reason about gaps today.
 */
export function argusSummarizeCoverageTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof summarizeCoverageSchema> {
  return {
    id: ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Summarize ARGUS coverage gaps grouped by ATT&CK technique. Reads `.soc-coverage-gaps` and ' +
      'returns the top N gap rows, plus counts of rules per technique and an overall score.',
    schema: summarizeCoverageSchema,
    tags: ['security', 'argus', 'argus:playbook', 'read', 'coverage'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ threat_profile_id: profileId, top_n_gaps: topN }, { esClient }) => {
      try {
        const filter: Record<string, unknown>[] = [];
        if (profileId) {
          filter.push({ term: { threat_profile_id: profileId } });
        }

        const response = await esClient.asCurrentUser.search<CoverageGapDoc>({
          index: ARGUS_SOC_INDICES.coverageGaps,
          size: topN,
          sort: [{ severity: { order: 'desc' } }, { confidence: { order: 'asc' } }],
          query: filter.length > 0 ? { bool: { filter } } : { match_all: {} },
          track_total_hits: true,
          ignore_unavailable: true,
        });

        const totalGaps =
          typeof response.hits.total === 'number'
            ? response.hits.total
            : response.hits.total?.value ?? 0;

        const gaps = response.hits.hits.map((h) => ({
          technique_id: h._source?.technique_id ?? null,
          technique_name: h._source?.technique_name ?? null,
          severity: h._source?.severity ?? 'unknown',
          confidence: h._source?.confidence ?? 0,
          rule_count: h._source?.rule_count ?? 0,
          note: h._source?.note ?? null,
          id: h._id,
        }));

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Found ${totalGaps} coverage gap(s); returning top ${gaps.length}.`,
                total_gaps: totalGaps,
                profile_id: profileId ?? null,
                gaps,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.summarize_coverage failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to summarize coverage: ${
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
