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

const createAgentSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
    .describe('Unique identifier for the agent (kebab-case, e.g. "soc-triage-agent")'),
  name: z.string().min(1).max(256).describe('Human-readable display name for the agent'),
  description: z.string().min(1).max(1024).describe('Description of what the agent does'),
  instructions: z
    .string()
    .optional()
    .describe('System instructions that define agent behavior and personality'),
  tool_ids: z
    .array(z.string().min(1))
    .default([])
    .describe('Array of tool IDs the agent should have access to'),
  skill_ids: z
    .array(z.string().min(1))
    .optional()
    .describe('Array of skill IDs to attach to the agent'),
  avatar_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .describe('Hex color code for the agent avatar (e.g. "#FF5733")'),
  avatar_symbol: z
    .string()
    .max(3)
    .optional()
    .describe('Symbol or initials for the agent avatar (e.g. "SOC")'),
});

export const createAgentTool = (
  coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>
): BuiltinToolDefinition<typeof createAgentSchema> => {
  return {
    id: platformCoreTools.createAgent,
    type: ToolType.builtin,
    description: cleanPrompt(`Create a new Agent Builder agent programmatically.

    Use this tool to provision a new agent with a specific ID, name, instructions, and tool/skill configuration.
    The agent will be immediately available after creation.

    Returns the full agent definition including its ID and configuration.
    `),
    schema: createAgentSchema,
    handler: async (
      {
        id,
        name,
        description,
        instructions,
        tool_ids: toolIds,
        skill_ids: skillIds,
        avatar_color: avatarColor,
        avatar_symbol: avatarSymbol,
      },
      { request, logger }
    ) => {
      try {
        const [, pluginsStart] = await coreSetup.getStartServices();
        const agentRegistry = await pluginsStart.agentBuilder.agents.getRegistry({ request });

        const existing = await agentRegistry.has(id);
        if (existing) {
          return {
            results: [
              errorResult(`Agent with id '${id}' already exists. Use update_agent to modify it.`),
            ],
          };
        }

        const agent = await agentRegistry.create({
          id,
          name,
          description,
          ...(avatarColor && { avatar_color: avatarColor }),
          ...(avatarSymbol && { avatar_symbol: avatarSymbol }),
          configuration: {
            tools: toolIds.length > 0 ? [{ tool_ids: toolIds }] : [],
            ...(instructions && { instructions }),
            ...(skillIds && { skill_ids: skillIds }),
          },
        });

        logger.info(`[create_agent] Created agent '${id}' successfully`);

        return {
          results: [
            otherResult({
              success: true,
              agent: {
                id: agent.id,
                name: agent.name,
                description: agent.description,
              },
            }),
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`[create_agent] Failed to create agent '${id}': ${message}`);
        return {
          results: [errorResult(`Failed to create agent: ${message}`)],
        };
      }
    },
    tags: [],
  };
};
