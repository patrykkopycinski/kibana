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
import { ARGUS_SOC_INDICES, MUTATION_VERDICT_ROUTE } from '@kbn/argus-console-common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_APPROVE_REJECT_MUTATION_TOOL_ID } from './constants';

const approveRejectSchema = z.object({
  rec_id: z.string().min(1).describe('Recommendation id of the mutation intent to decide on.'),
  verdict: z.enum(['approve', 'reject']).describe('Operator verdict.'),
  reason: z.string().min(1).describe('Plain-text reason stored alongside the verdict audit row.'),
  approver: z
    .string()
    .default('agent_builder')
    .describe('Stored on the audit row so the Mutations ledger shows attribution.'),
});

/**
 * Skill/tool parity for the Approve/Reject row actions on the Mutations panel.
 * Writes a verdict outcome and an audit-trail breadcrumb. The
 * `soc_autonomous_applier` workflow polls outcomes, so an approved verdict
 * will pick up the next tick and dispatch the apply.
 */
export function argusApproveRejectMutationTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof approveRejectSchema> {
  return {
    id: ARGUS_APPROVE_REJECT_MUTATION_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Approve or reject a pending ARGUS mutation intent. Writes a verdict outcome and an audit ' +
      `row — functionally equivalent to the Approve/Reject buttons in the ARGUS Console. Uses the ` +
      `${MUTATION_VERDICT_ROUTE} shape so writes land in the same audit surface.`,
    schema: approveRejectSchema,
    tags: ['security', 'argus', 'argus:playbook', 'write'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) =>
        getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ rec_id: recId, verdict, reason, approver }, { esClient }) => {
      const now = new Date().toISOString();
      const outcomeId = `${recId}-${verdict}-${Date.now().toString(36)}`;

      try {
        await esClient.asCurrentUser.index({
          index: ARGUS_SOC_INDICES.outcomes,
          id: outcomeId,
          refresh: 'wait_for',
          document: {
            '@timestamp': now,
            rec_id: recId,
            outcome: verdict === 'approve' ? 'approved' : 'rejected',
            origin: 'playbook_tool',
            approver,
            reason,
          },
        });

        await esClient.asCurrentUser.index({
          index: ARGUS_SOC_INDICES.auditTrail,
          refresh: false,
          document: {
            '@timestamp': now,
            kind: `mutation_${verdict}`,
            rec_id: recId,
            actor: approver,
            reason,
            tool: ARGUS_APPROVE_REJECT_MUTATION_TOOL_ID,
          },
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Filed ${verdict} for ${recId}`,
                rec_id: recId,
                verdict,
                outcome_id: outcomeId,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.approve_reject_mutation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to record verdict: ${
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
