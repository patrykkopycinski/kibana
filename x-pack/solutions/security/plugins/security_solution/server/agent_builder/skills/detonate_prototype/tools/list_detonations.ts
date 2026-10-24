/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { z, lazySchema } from '@kbn/zod/v4';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';

import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import type { DetonateClient } from '../../../../detonate_prototype';
import { LIST_DETONATIONS_TOOL_ID } from '..';
import {
  DETONATE_TOOL_MAX_RESULT_TOKENS,
  detonateServiceErrorResult,
  insufficientPrivilegesResult,
  LIST_DETONATIONS_PAGE_SIZE,
  MAX_QUERY_STRING_LENGTH,
  summarizeDetonationTask,
} from '../types';

/**
 * Pages beyond this would make the service's `offset + size` window
 * meaningless for a prototype, and an agent walking thousands of past runs is
 * never the useful answer.
 */
const MAX_LIST_DETONATIONS_PAGE = 49;

const listDetonationsSchema = lazySchema(() =>
  z.object({
    queryString: z
      .string()
      .max(MAX_QUERY_STRING_LENGTH)
      .optional()
      .describe(
        'Free-text filter over past runs — a hash, a filename or a tag. Omit to list the most recent runs.'
      ),
    page: z
      .number()
      .int()
      .min(0)
      .max(MAX_LIST_DETONATIONS_PAGE)
      .optional()
      .describe(
        '0-based page. The result reports `total` and `hasMore` so further pages can be walked.'
      ),
  })
);

/**
 * Lists past detonations. Exists so the agent can answer "have we detonated
 * this hash before" without spending a VM re-running a sample that already
 * has a recorded result.
 */
export const listDetonationsTool = (
  endpointAppContextService: EndpointAppContextService,
  getClient: () => DetonateClient
): BuiltinSkillBoundedTool<typeof listDetonationsSchema> => ({
  id: LIST_DETONATIONS_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Lists past detonation runs, optionally filtered by hash, filename or tag. Check here before submitting: a sample that was already detonated has a recorded result, and re-running it spends sandbox time for an answer that already exists.',
  schema: listDetonationsSchema,
  maxResultTokens: DETONATE_TOOL_MAX_RESULT_TOKENS,
  handler: async (params, { request }) => {
    const authz = await endpointAppContextService.getEndpointAuthz(request);
    if (!authz.canReadSecuritySolution) {
      return insufficientPrivilegesResult('canReadSecuritySolution');
    }

    const { queryString, page = 0 } = params;
    const offset = page * LIST_DETONATIONS_PAGE_SIZE;

    try {
      const response = await getClient().listTasks({
        ...(queryString ? { query_string: queryString } : {}),
        offset,
        size: LIST_DETONATIONS_PAGE_SIZE,
      });

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              kind: 'detonation_task_list' as const,
              total: response.total,
              page,
              pageSize: LIST_DETONATIONS_PAGE_SIZE,
              hasMore: offset + response.tasks.length < response.total,
              tasks: response.tasks.map(summarizeDetonationTask),
            },
          },
        ],
      };
    } catch (error) {
      return detonateServiceErrorResult(error, 'list detonation tasks');
    }
  },
});
