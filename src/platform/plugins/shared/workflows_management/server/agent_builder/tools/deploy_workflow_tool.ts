/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolType } from '@kbn/agent-builder-common';
import { z } from '@kbn/zod/v4';
import { workflowTools } from '../../../common/agent_builder/constants';
import { parseYamlToJSONWithoutValidation } from '../../../common/lib/yaml';
import type { WorkflowsManagementApi } from '../../api/workflows_management_api';
import type { AgentBuilderPluginSetupContract } from '../../types';

const extractWorkflowName = (yaml: string): string | undefined => {
  const parsed = parseYamlToJSONWithoutValidation(yaml);
  if (!parsed.success) return undefined;
  return parsed.json?.name as string | undefined;
};

export function registerDeployWorkflowTool(
  agentBuilder: AgentBuilderPluginSetupContract,
  api: WorkflowsManagementApi
): void {
  agentBuilder.tools.register({
    id: workflowTools.deployWorkflow,
    type: ToolType.builtin,
    description: `Deploy a workflow from YAML definition. Creates a new workflow in Kibana that can be triggered on schedule, by events, or manually.

Before deploying, validates the YAML. If a workflow with the same name already exists, returns an error to prevent duplicates.

The YAML must follow the standard workflow schema with version, name, description, enabled, triggers, and steps.

Returns the deployed workflow ID and status.`,
    schema: z.object({
      yaml: z.string().describe('The complete workflow YAML definition to deploy'),
      skip_duplicate_check: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, skips the duplicate name check and creates the workflow even if one with the same name exists'
        ),
    }),
    tags: ['workflows', 'deploy'],
    handler: async (
      { yaml, skip_duplicate_check: skipDuplicateCheck },
      { spaceId, request, logger }
    ) => {
      try {
        const workflowName = extractWorkflowName(yaml);

        if (!skipDuplicateCheck && workflowName) {
          const existing = await api.getWorkflows({ size: 100, page: 1 }, spaceId);
          const duplicate = existing.results.find(
            (w: { name: string }) => w.name.toLowerCase() === workflowName.toLowerCase()
          );
          if (duplicate) {
            return {
              results: [
                {
                  type: 'error' as const,
                  data: {
                    message: `A workflow named '${workflowName}' already exists (id: ${duplicate.id}). Use skip_duplicate_check=true to create anyway, or update the existing workflow.`,
                  },
                },
              ],
            };
          }
        }

        const validation = await api.validateWorkflow(yaml, spaceId, request);
        if (!validation.valid) {
          return {
            results: [
              {
                type: 'error' as const,
                data: {
                  message: 'Workflow YAML validation failed',
                  diagnostics: validation.diagnostics,
                },
              },
            ],
          };
        }

        const created = await api.createWorkflow({ yaml }, spaceId, request);

        logger.info(`[deploy_workflow] Deployed workflow '${created.name}' (id: ${created.id})`);

        return {
          results: [
            {
              type: 'other' as const,
              data: {
                success: true,
                workflow: {
                  id: created.id,
                  name: created.name,
                  enabled: created.enabled,
                },
              },
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`[deploy_workflow] Failed: ${message}`);
        return {
          results: [
            {
              type: 'error' as const,
              data: {
                message: `Failed to deploy workflow: ${message}`,
              },
            },
          ],
        };
      }
    },
  });
}
