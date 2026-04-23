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
import { ARGUS_LIST_UNCOVERED_TECHNIQUES_TOOL_ID } from './constants';

const listUncoveredTechniquesSchema = z.object({
  profile_id: z
    .string()
    .optional()
    .describe('Optional threat-profile filter. When omitted, scans gaps across all profiles.'),
  tactic: z
    .string()
    .optional()
    .describe('Optional ATT&CK tactic filter (e.g. "initial-access", "execution").'),
  top_n: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('How many uncovered techniques to return. Ordered by severity desc, confidence asc.'),
});

interface CoverageGapDoc {
  '@timestamp'?: string;
  technique_id?: string;
  technique_name?: string;
  tactic?: string;
  severity?: 'low' | 'med' | 'high';
  confidence?: number;
  status?: string;
  threat_profile_id?: string;
  source?: string;
}

interface CorpusDoc {
  rule_id?: string;
  source?: string;
  mitre_technique?: string[];
}

/**
 * Reads `.soc-coverage-gaps` for currently-open gaps and cross-references
 * `.soc-detection-corpus` to report whether each uncovered technique has
 * Argus-authored or community-authored rules. Pure read — no writes.
 */
export function argusListUncoveredTechniquesTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof listUncoveredTechniquesSchema> {
  return {
    id: ARGUS_LIST_UNCOVERED_TECHNIQUES_TOOL_ID,
    type: ToolType.builtin,
    description:
      'List ATT&CK techniques with open coverage gaps, optionally filtered by profile and/or ' +
      'tactic. Returns per-technique counts of Argus-authored vs community-authored rules so ' +
      'skills can reason about whether a gap is genuine or redundantly covered elsewhere.',
    schema: listUncoveredTechniquesSchema,
    tags: ['security', 'argus', 'argus:playbook', 'read', 'coverage'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) =>
        getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ profile_id: profileId, tactic, top_n: topN }, { esClient }) => {
      try {
        const gapFilter: Record<string, unknown>[] = [{ term: { status: 'open' } }];
        if (profileId) gapFilter.push({ term: { threat_profile_id: profileId } });
        if (tactic) gapFilter.push({ term: { tactic } });

        const gapsRes = await esClient.asCurrentUser.search<CoverageGapDoc>({
          index: ARGUS_SOC_INDICES.coverageGaps,
          size: topN,
          sort: [{ severity: { order: 'desc' } }, { confidence: { order: 'asc' } }],
          query: { bool: { filter: gapFilter } },
          ignore_unavailable: true,
          track_total_hits: true,
        });

        const techniqueIds = gapsRes.hits.hits
          .map((h) => h._source?.technique_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        let corpusByTechnique: Record<
          string,
          { argus_authored: number; community_authored: number; source_count: number }
        > = {};

        if (techniqueIds.length > 0) {
          const corpusRes = await esClient.asCurrentUser.search<CorpusDoc>({
            index: ARGUS_SOC_INDICES.detectionCorpus,
            size: 0,
            query: {
              bool: {
                filter: [{ terms: { mitre_technique: techniqueIds } }],
              },
            },
            aggs: {
              by_technique: {
                terms: { field: 'mitre_technique', size: topN * 4 },
                aggs: {
                  by_source: { terms: { field: 'source', size: 20 } },
                },
              },
            },
            ignore_unavailable: true,
          });

          const aggs = corpusRes.aggregations as
            | {
                by_technique?: {
                  buckets?: Array<{
                    key: string;
                    doc_count: number;
                    by_source?: { buckets?: Array<{ key: string; doc_count: number }> };
                  }>;
                };
              }
            | undefined;

          corpusByTechnique = (aggs?.by_technique?.buckets ?? []).reduce<typeof corpusByTechnique>(
            (acc, bucket) => {
              const sources = bucket.by_source?.buckets ?? [];
              const argus = sources
                .filter((s) => s.key === 'argus' || s.key.startsWith('argus.'))
                .reduce((sum, s) => sum + s.doc_count, 0);
              const community = bucket.doc_count - argus;
              acc[bucket.key] = {
                argus_authored: argus,
                community_authored: Math.max(0, community),
                source_count: sources.length,
              };
              return acc;
            },
            {}
          );
        }

        const techniques = gapsRes.hits.hits.map((h) => {
          const src = h._source ?? {};
          const techniqueId = src.technique_id ?? '';
          const corpus = corpusByTechnique[techniqueId] ?? {
            argus_authored: 0,
            community_authored: 0,
            source_count: 0,
          };
          return {
            technique_id: techniqueId,
            name: src.technique_name ?? null,
            tactic: src.tactic ?? null,
            severity: src.severity ?? 'med',
            confidence: src.confidence ?? 0,
            argus_authored: corpus.argus_authored > 0,
            community_authored: corpus.community_authored > 0,
            source_count: corpus.source_count,
          };
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Returned ${techniques.length} uncovered technique(s)${
                  profileId ? ` for profile=${profileId}` : ''
                }${tactic ? `, tactic=${tactic}` : ''}.`,
                profile_id: profileId ?? null,
                tactic: tactic ?? null,
                techniques,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.list_uncovered_techniques failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to list uncovered techniques: ${
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
