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
import { GET_DETONATION_TOOL_ID } from '..';
import {
  DETONATE_TOOL_MAX_RESULT_TOKENS,
  detonateServiceErrorResult,
  insufficientPrivilegesResult,
  MAX_TASK_ID_LENGTH,
  summarizeDetonationTask,
} from '../types';

const getDetonationSchema = lazySchema(() =>
  z.object({
    taskId: z
      .string()
      .min(1)
      .max(MAX_TASK_ID_LENGTH)
      .describe('ID of a detonation task, as returned by submit_detonation or list_detonations.'),
  })
);

/**
 * Reads one detonation task. This is how the agent polls: `complete` is
 * derived from the shared completion predicate, never from elapsed time.
 */
export const getDetonationTool = (
  endpointAppContextService: EndpointAppContextService,
  getClient: () => DetonateClient
): BuiltinSkillBoundedTool<typeof getDetonationSchema> => ({
  id: GET_DETONATION_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Retrieves a detonation task by ID: its current stage, whether it has finished or failed, and the Elastic Defend alerts the sample produced inside the sandbox. Use to poll a run submitted with submit_detonation, or to report on a past run. A finished run with zero alerts is a real finding (no malicious behavior observed — not proof the sample is benign; it may be a detection gap), not an error.',
  schema: getDetonationSchema,
  maxResultTokens: DETONATE_TOOL_MAX_RESULT_TOKENS,
  handler: async (params, { request }) => {
    const authz = await endpointAppContextService.getEndpointAuthz(request);
    if (!authz.canReadSecuritySolution) {
      return insufficientPrivilegesResult('canReadSecuritySolution');
    }

    const { taskId } = params;

    try {
      const task = await getClient().getTask(taskId);

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: { ...summarizeDetonationTask(task), found: true },
          },
        ],
      };
    } catch (error) {
      return detonateServiceErrorResult(error, `read detonation task ${taskId}`, { taskId });
    }
  },
});
