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

import { spaceRunTag } from '../../../../../common/detonate_prototype';
import { LIST_DETONATIONS_TOOL_ID } from '..';
import {
  DETONATE_TOOL_MAX_RESULT_TOKENS,
  detonateServiceErrorResult,
  insufficientPrivilegesResult,
  type DetonateSkillDeps,
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
    alertId: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe(
        'Only runs started from this alert. Use when the analyst asks "what happened with the detonation on this alert".'
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
export const listDetonationsTool = ({
  endpointAppContextService,
  getClient,
  hasDetonatePrivilege,
}: DetonateSkillDeps): BuiltinSkillBoundedTool<typeof listDetonationsSchema> => ({
  id: LIST_DETONATIONS_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Lists past detonation runs, optionally filtered by hash, filename or tag. Check here before submitting: a sample that was already detonated has a recorded result, and re-running it spends sandbox time for an answer that already exists.',
  schema: listDetonationsSchema,
  maxResultTokens: DETONATE_TOOL_MAX_RESULT_TOKENS,
  handler: async (params, { request }) => {
    if (!(await hasDetonatePrivilege(request, 'read'))) {
      return insufficientPrivilegesResult('Security Solution read or Detonate');
    }

    const { queryString, alertId, page = 0 } = params;
    const offset = page * LIST_DETONATIONS_PAGE_SIZE;

    try {
      const response = await getClient().listTasks({
        ...(queryString ? { query_string: queryString } : {}),
        ...(alertId ? { alert_id: alertId } : {}),
        tag: spaceRunTag(endpointAppContextService.getActiveSpaceId(request)),
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
