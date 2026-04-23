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
import { ARGUS_LIST_ACTOR_COVERAGE_TOOL_ID } from './constants';

const listActorCoverageSchema = z.object({
  actor_id: z
    .string()
    .min(1)
    .describe('Threat-actor id as it appears in `.soc-threat-actors` (e.g. "G0016" for APT29).'),
});

interface ThreatActorDoc {
  actor_id?: string;
  actor_name?: string;
  aliases?: string[];
  techniques?: string[];
  software?: string[];
  first_seen?: string;
  last_seen?: string;
  references?: string[];
}

interface CorpusBucket {
  key: string;
  doc_count: number;
  by_source?: { buckets?: Array<{ key: string; doc_count: number }> };
}

/**
 * Returns per-technique coverage for a named threat actor by joining
 * `.soc-threat-actors` (technique list) with `.soc-detection-corpus`
 * (rule provenance). Gracefully degrades when the threat-actors index
 * isn't seeded yet — returns `source: 'unavailable'` with an empty list
 * so downstream skills don't throw.
 */
export function argusListActorCoverageTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof listActorCoverageSchema> {
  return {
    id: ARGUS_LIST_ACTOR_COVERAGE_TOOL_ID,
    type: ToolType.builtin,
    description:
      'For a given threat-actor id, list every ATT&CK technique it is known to use along with ' +
      'whether Argus and/or community corpora currently cover it. Used by actor-escalation and ' +
      'purple-team skills to pinpoint which techniques lack detection.',
    schema: listActorCoverageSchema,
    tags: ['security', 'argus', 'argus:playbook', 'read', 'actor', 'coverage'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) =>
        getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ actor_id: actorId }, { esClient }) => {
      try {
        let actor: ThreatActorDoc | undefined;
        try {
          const actorRes = await esClient.asCurrentUser.search<ThreatActorDoc>({
            index: ARGUS_SOC_INDICES.threatActors,
            size: 1,
            query: {
              bool: {
                should: [{ term: { actor_id: actorId } }, { term: { _id: actorId } }],
                minimum_should_match: 1,
              },
            },
            ignore_unavailable: true,
          });
          actor = actorRes.hits.hits[0]?._source;
        } catch {
          actor = undefined;
        }

        if (!actor) {
          return {
            results: [
              {
                type: ToolResultType.other,
                data: {
                  message: `Actor ${actorId} not found in .soc-threat-actors. Seed the index first or pass a different id.`,
                  actor_id: actorId,
                  source: 'unavailable',
                  actor_name: null,
                  techniques: [],
                  totals: {
                    total: 0,
                    covered_by_argus: 0,
                    covered_by_community_only: 0,
                    uncovered: 0,
                  },
                },
              },
            ],
          };
        }

        const techniqueIds: string[] = Array.isArray(actor.techniques) ? actor.techniques : [];

        let corpusByTechnique: Record<
          string,
          { argus_authored: number; community_authored: number; redundant_rule_count: number }
        > = {};

        if (techniqueIds.length > 0) {
          const corpusRes = await esClient.asCurrentUser.search({
            index: ARGUS_SOC_INDICES.detectionCorpus,
            size: 0,
            query: { bool: { filter: [{ terms: { mitre_technique: techniqueIds } }] } },
            aggs: {
              by_technique: {
                terms: { field: 'mitre_technique', size: techniqueIds.length * 2 },
                aggs: {
                  by_source: { terms: { field: 'source', size: 20 } },
                },
              },
            },
            ignore_unavailable: true,
          });

          const aggs = corpusRes.aggregations as
            | { by_technique?: { buckets?: CorpusBucket[] } }
            | undefined;

          corpusByTechnique = (aggs?.by_technique?.buckets ?? []).reduce<typeof corpusByTechnique>(
            (acc, bucket) => {
              const sources = bucket.by_source?.buckets ?? [];
              const argus = sources
                .filter((s) => s.key === 'argus' || s.key.startsWith('argus.'))
                .reduce((sum, s) => sum + s.doc_count, 0);
              const community = Math.max(0, bucket.doc_count - argus);
              // Redundancy: more than one rule covering the same technique.
              const redundant = bucket.doc_count > 1 ? bucket.doc_count : 0;
              acc[bucket.key] = {
                argus_authored: argus,
                community_authored: community,
                redundant_rule_count: redundant,
              };
              return acc;
            },
            {}
          );
        }

        const techniques = techniqueIds.map((id) => {
          const entry = corpusByTechnique[id] ?? {
            argus_authored: 0,
            community_authored: 0,
            redundant_rule_count: 0,
          };
          return {
            technique_id: id,
            argus_authored: entry.argus_authored > 0,
            community_authored: entry.community_authored > 0,
            redundant_rule_count: entry.redundant_rule_count,
          };
        });

        const totals = techniques.reduce(
          (acc, t) => {
            if (t.argus_authored) acc.covered_by_argus += 1;
            else if (t.community_authored) acc.covered_by_community_only += 1;
            else acc.uncovered += 1;
            return acc;
          },
          {
            total: techniques.length,
            covered_by_argus: 0,
            covered_by_community_only: 0,
            uncovered: 0,
          }
        );

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Actor ${actor.actor_name ?? actorId}: ${totals.total} techniques, ${
                  totals.uncovered
                } uncovered.`,
                actor_id: actor.actor_id ?? actorId,
                actor_name: actor.actor_name ?? null,
                aliases: actor.aliases ?? [],
                source: 'available' as const,
                techniques,
                totals,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.list_actor_coverage failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to list actor coverage: ${
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
