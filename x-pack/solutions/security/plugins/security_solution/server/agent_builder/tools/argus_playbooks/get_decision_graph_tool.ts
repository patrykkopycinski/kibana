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
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { buildDecisionGraph } from '../../../lib/argus/routes/decision_graph';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_GET_DECISION_GRAPH_TOOL_ID, ARGUS_READ_TAG } from './constants';

const ROOT_KINDS = [
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

const getDecisionGraphSchema = z.object({
  root_kind: z
    .enum(ROOT_KINDS)
    .describe(
      'Kind of subject to root the neighborhood on. Use `advisory` for CVEs, `rule` for detection rules, `actor` for threat actors, `reasoning` for a specific ARGUS run_id, etc.'
    ),
  root_id: z
    .string()
    .min(1)
    .max(1024)
    .describe(
      'Subject identifier — e.g. `CVE-2024-27198` for an advisory, `rule-jetbrains-teamcity-auth-bypass` for a rule, `G0016` for an actor, a `run_id` for reasoning.'
    ),
  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .default(2)
    .describe('BFS depth around the root. Server-capped at 3. Defaults to 2.'),
});

/**
 * Read-only tool that returns the same decision-graph neighborhood the
 * ARGUS Console flyout/full-screen explorer render. Lets LLM skills reason
 * over the typed-edge graph (advisory -> intent -> outcome -> rule -> ...)
 * without having to hand-write Elasticsearch queries over `.soc-decision-graph`.
 */
export function argusGetDecisionGraphTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof getDecisionGraphSchema> {
  return {
    id: ARGUS_GET_DECISION_GRAPH_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Fetch the ARGUS decision-graph neighborhood rooted at a given subject (advisory / rule / ' +
      'actor / technique / reasoning run / outcome / audit / observation). Returns the same ' +
      'node+edge payload rendered by the ARGUS Console flyout. Read-only. Results are capped ' +
      'at 200 nodes and depth 3; `truncated: true` when the cap was hit.',
    schema: getDecisionGraphSchema,
    tags: ['security', 'argus', ARGUS_READ_TAG, 'decision-graph'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) =>
        getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ root_kind: rootKind, root_id: rootId, depth }, { esClient }) => {
      try {
        const payload = await buildDecisionGraph({
          esClient: esClient.asCurrentUser,
          rootKind,
          rootId,
          depth,
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Decision graph for ${rootKind}:${rootId} (depth=${payload.depth}, ${
                  payload.nodes.length
                } nodes, ${payload.edges.length} edges${payload.truncated ? ', truncated' : ''}).`,
                graph: payload,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.get_decision_graph failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch decision graph: ${
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
