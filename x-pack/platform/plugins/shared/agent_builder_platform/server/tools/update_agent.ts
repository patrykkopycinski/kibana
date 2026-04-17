/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { CoreSetup } from '@kbn/core/server';
import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import { errorResult, otherResult } from '@kbn/agent-builder-genai-utils/tools/utils/results';
import type { AgentBuilderPlatformPluginStart, PluginStartDependencies } from '../types';

const updateAgentSchema = z.object({
  agent_id: z.string().min(1).describe('The ID of the agent to update'),
  name: z.string().min(1).max(256).optional().describe('Updated display name'),
  description: z.string().min(1).max(1024).optional().describe('Updated description'),
  instruction_patch: z
    .string()
    .optional()
    .describe(
      "Text to APPEND to the agent's existing instructions. Use this to enrich an agent's capabilities without overwriting its current instructions."
    ),
  instructions_replace: z
    .string()
    .optional()
    .describe(
      "Completely replace the agent's instructions with this text. Only use when a full rewrite is needed."
    ),
  tool_ids: z
    .array(z.string())
    .optional()
    .describe("Replace the agent's tool list with these tool IDs"),
  skill_ids: z
    .array(z.string())
    .optional()
    .describe("Replace the agent's skill list with these skill IDs"),
});

export const updateAgentTool = (
  coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>
): BuiltinToolDefinition<typeof updateAgentSchema> => {
  return {
    id: platformCoreTools.updateAgent,
    type: ToolType.builtin,
    description: cleanPrompt(`Update an existing Agent Builder agent's configuration.

    Supports two modes for instructions:
    - **instruction_patch**: Appends text to the agent's existing instructions (preferred for enrichment).
    - **instructions_replace**: Completely replaces the instructions (use only for full rewrites).

    You can also update the agent's name, description, tool_ids, and skill_ids.
    Only the fields you provide will be changed; omitted fields remain unchanged.

    Returns the updated agent definition.
    `),
    schema: updateAgentSchema,
    handler: async (
      {
        agent_id: agentId,
        name,
        description,
        instruction_patch: instructionPatch,
        instructions_replace: instructionsReplace,
        tool_ids: toolIds,
        skill_ids: skillIds,
      },
      { request, logger }
    ) => {
      try {
        const [, pluginsStart] = await coreSetup.getStartServices();
        const agentRegistry = await pluginsStart.agentBuilder.agents.getRegistry({ request });

        const existing = await agentRegistry.get(agentId);
        if (!existing) {
          return {
            results: [errorResult(`Agent with id '${agentId}' not found.`)],
          };
        }

        let resolvedInstructions: string | undefined;
        if (instructionsReplace !== undefined) {
          resolvedInstructions = instructionsReplace;
        } else if (instructionPatch !== undefined) {
          const currentInstructions = existing.configuration.instructions ?? '';
          resolvedInstructions = currentInstructions
            ? `${currentInstructions}\n\n${instructionPatch}`
            : instructionPatch;
        }

        const updatePayload: Record<string, unknown> = {};
        if (name !== undefined) updatePayload.name = name;
        if (description !== undefined) updatePayload.description = description;

        const configUpdate: Record<string, unknown> = {};
        if (resolvedInstructions !== undefined) configUpdate.instructions = resolvedInstructions;
        if (toolIds !== undefined) configUpdate.tools = [{ tool_ids: toolIds }];
        if (skillIds !== undefined) configUpdate.skill_ids = skillIds;

        if (Object.keys(configUpdate).length > 0) {
          updatePayload.configuration = configUpdate;
        }

        const agent = await agentRegistry.update(agentId, updatePayload as any);

        logger.info(`[update_agent] Updated agent '${agentId}' successfully`);

        return {
          results: [
            otherResult({
              success: true,
              agent: {
                id: agent.id,
                name: agent.name,
                description: agent.description,
                instructions_length: agent.configuration.instructions?.length ?? 0,
              },
            }),
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`[update_agent] Failed to update agent '${agentId}': ${message}`);
        return {
          results: [errorResult(`Failed to update agent: ${message}`)],
        };
      }
    },
    tags: [],
  };
};
