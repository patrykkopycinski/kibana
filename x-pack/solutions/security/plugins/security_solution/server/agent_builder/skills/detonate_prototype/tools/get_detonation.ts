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

import { GET_DETONATION_TOOL_ID } from '..';
import { readCompletedUpdates } from '../../../../detonate_prototype/completed_updates';
import { toDetonationRecord } from '../../../../detonate_prototype/detonation_record';
import { getTaskInSpace } from '../../../../detonate_prototype/space_scope';
import {
  DETONATE_TOOL_MAX_RESULT_TOKENS,
  detonateServiceErrorResult,
  insufficientPrivilegesResult,
  type DetonateSkillDeps,
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
 * Reads one detonation task. This is how the agent polls: `finished` is
 * derived from the shared completion predicate, never from elapsed time.
 */
export const getDetonationTool = ({
  endpointAppContextService,
  getClient,
  hasDetonatePrivilege,
  recordRun,
}: DetonateSkillDeps): BuiltinSkillBoundedTool<typeof getDetonationSchema> => ({
  id: GET_DETONATION_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Retrieves a detonation task by ID: its current stage, whether it has finished or failed, and the Elastic Defend alerts the sample produced inside the sandbox. Use to poll a run submitted with submit_detonation, or to report on a past run. A finished run with zero alerts is a real finding (no malicious behavior observed — not proof the sample is safe; it may be a detection gap), not an error.',
  schema: getDetonationSchema,
  maxResultTokens: DETONATE_TOOL_MAX_RESULT_TOKENS,
  handler: async (params, { request, logger }) => {
    if (!(await hasDetonatePrivilege(request, 'read'))) {
      return insufficientPrivilegesResult('Security Solution read or Detonate');
    }

    const { taskId } = params;

    try {
      const client = getClient(request);
      const spaceId = endpointAppContextService.getActiveSpaceId(request);
      const task = await getTaskInSpace(client, taskId, spaceId);

      // The same write the poll route makes, so a run polled only by the agent still ends up
      // complete in the results store. Never awaited and never fails the tool.
      void (async () => {
        const updates = await readCompletedUpdates(client, task, logger);
        await recordRun(spaceId, () => toDetonationRecord(task, { spaceId, updates }));
      })().catch((error) =>
        logger.debug(`Detonation ${taskId}: could not record the run: ${error}`)
      );

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
