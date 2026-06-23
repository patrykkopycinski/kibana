/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { z } from '@kbn/zod/v4';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import type { EndpointAppContextService } from '../../../../../endpoint/endpoint_app_context_services';
import { EXECUTE_COMMAND_TOOL_ID } from '../..';

const executeCommandSchema = z.object({
  hostName: z
    .string()
    .min(1)
    .describe('The hostname of the endpoint where the command will be executed.'),
  command: z
    .string()
    .min(1)
    .describe('The shell command to execute on the endpoint (e.g. "whoami", "ls -la /tmp").'),
  timeout: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Maximum timeout in seconds before the command is terminated. Defaults to 600.'),
  comment: z
    .string()
    .min(1)
    .optional()
    .describe('An optional comment explaining why the command is being executed.'),
});

export const executeCommandTool = (
  endpointAppContextService: EndpointAppContextService
): BuiltinSkillBoundedTool => {
  return {
    id: EXECUTE_COMMAND_TOOL_ID,
    type: ToolType.builtin,
    description: `Execute a shell command on an endpoint by its hostname. The command runs through the Elastic Defend Response Actions service. Use this for detection emulation, forensic investigation, or operational tasks that require running a command on a live endpoint.`,
    schema: executeCommandSchema,
    handler: async (params, { logger }) => {
      try {
        const hostName = params.hostName as string;
        const command = params.command as string;
        const timeout = params.timeout as number | undefined;
        const comment = params.comment as string | undefined;
        const spaceId = DEFAULT_SPACE_ID;
        const responseActionsClient = endpointAppContextService.getInternalResponseActionsClient({
          spaceId,
          agentType: 'endpoint',
        });

        const fleetServices = endpointAppContextService.getInternalFleetServices(spaceId);
        const agent = fleetServices.agent;
        const agents = await agent.listAgents({
          showInactive: true,
          kuery: `local_metadata.host.name: ${hostName}`,
          page: 1,
          perPage: 1,
        });

        if (!agents?.agents?.length) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.other,
                data: {
                  hostName,
                  found: false,
                  reason: 'endpoint_not_found' as const,
                  message: `No endpoint found with hostname '${hostName}'.`,
                },
              },
            ],
          };
        }

        const endpointIds = agents.agents.map((a) => a.id);

        const actionDetails = await responseActionsClient.execute(
          {
            endpoint_ids: endpointIds,
            parameters: {
              command,
              ...(timeout != null ? { timeout } : {}),
            },
            comment: comment ?? `Executed via AI agent on ${hostName}: ${command}`,
          },
          { hosts: { [endpointIds[0]]: { name: hostName } } }
        );

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                actionId: actionDetails.id,
                status: actionDetails.status,
                wasSuccessful: actionDetails.wasSuccessful,
                hosts: actionDetails.hosts,
                command,
                comment,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(error);
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: {
                message: `Error executing command on host: ${error.message}`,
              },
            },
          ],
        };
      }
    },
  };
};
