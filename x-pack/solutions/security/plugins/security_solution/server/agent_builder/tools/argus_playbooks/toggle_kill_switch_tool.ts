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
import { ARGUS_SOC_INDICES, KILL_SWITCH_DOC_ID } from '@kbn/argus-console-common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_TOGGLE_KILL_SWITCH_TOOL_ID } from './constants';

const toggleKillSwitchSchema = z.object({
  enabled: z.boolean().describe('True halts all auto-apply activity. False resumes autonomy.'),
  reason: z
    .string()
    .min(1)
    .describe('Required reason — stored on the audit trail for post-hoc review.'),
  actor: z
    .string()
    .default('agent_builder')
    .describe('Attribution for the audit trail.'),
});

/**
 * Parity for the header kill-switch chip. Writes the singleton doc and drops
 * an audit row — same shape the `kill_switch` HTTP route produces.
 */
export function argusToggleKillSwitchTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof toggleKillSwitchSchema> {
  return {
    id: ARGUS_TOGGLE_KILL_SWITCH_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Toggle the ARGUS autonomous-applier kill switch. Enables or disables every auto-apply ' +
      'path (rule_create, rule_patch, response). Reason is mandatory for audit compliance.',
    schema: toggleKillSwitchSchema,
    tags: ['security', 'argus', 'argus:playbook', 'write', 'kill-switch'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ enabled, reason, actor }, { esClient }) => {
      const now = new Date().toISOString();

      try {
        await esClient.asCurrentUser.index({
          index: ARGUS_SOC_INDICES.killSwitch,
          id: KILL_SWITCH_DOC_ID,
          refresh: 'wait_for',
          document: {
            '@timestamp': now,
            enabled,
            reason,
            actor,
          },
        });

        await esClient.asCurrentUser.index({
          index: ARGUS_SOC_INDICES.auditTrail,
          refresh: false,
          document: {
            '@timestamp': now,
            kind: enabled ? 'kill_switch_engaged' : 'kill_switch_released',
            actor,
            reason,
            tool: ARGUS_TOGGLE_KILL_SWITCH_TOOL_ID,
          },
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: enabled
                  ? `Kill switch ENGAGED — autonomy paused (${reason})`
                  : `Kill switch RELEASED — autonomy resumed (${reason})`,
                enabled,
                reason,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.toggle_kill_switch failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to toggle kill switch: ${
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
