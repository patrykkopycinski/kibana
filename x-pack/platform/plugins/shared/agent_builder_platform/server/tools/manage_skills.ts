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

const manageSkillsSchema = z.object({
  operation: z.enum(['create', 'update']).describe('The operation to perform'),
  id: z
    .string()
    .min(1)
    .max(128)
    .describe(
      'Skill ID. For create: the new unique ID (kebab-case). For update: the existing skill ID.'
    ),
  name: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe('Human-readable name for the skill. Required for create.'),
  description: z
    .string()
    .min(1)
    .max(1024)
    .optional()
    .describe('Description of what the skill does. Required for create.'),
  content: z
    .string()
    .optional()
    .describe(
      'Skill instructions content in markdown. This is the knowledge the agent uses when the skill is active. Required for create.'
    ),
  tool_ids: z
    .array(z.string())
    .optional()
    .describe('Tool IDs from the tool registry that this skill references'),
});

export const manageSkillsTool = (
  coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>
): BuiltinToolDefinition<typeof manageSkillsSchema> => {
  return {
    id: platformCoreTools.manageSkills,
    type: ToolType.builtin,
    description: cleanPrompt(`Create or update Agent Builder skills programmatically.

    Skills are reusable knowledge modules that can be attached to agents.

    **create**: Creates a new user-defined skill. Requires id, name, description, and content.
    **update**: Updates an existing user-defined skill. Only provided fields will be changed.

    Built-in skills cannot be modified.

    Returns the skill definition after the operation.
    `),
    schema: manageSkillsSchema,
    handler: async (
      { operation, id, name, description, content, tool_ids: toolIds },
      { request, logger }
    ) => {
      try {
        const [, pluginsStart] = await coreSetup.getStartServices();
        const skillRegistry = await pluginsStart.agentBuilder.skills.getRegistry({ request });

        if (operation === 'create') {
          if (!name || !description || !content) {
            return {
              results: [
                errorResult('Create operation requires name, description, and content fields.'),
              ],
            };
          }

          const existing = await skillRegistry.has(id);
          if (existing) {
            return {
              results: [
                errorResult(
                  `Skill with id '${id}' already exists. Use operation 'update' to modify it.`
                ),
              ],
            };
          }

          const skill = await skillRegistry.create({
            id,
            name,
            description,
            content,
            tool_ids: toolIds ?? [],
          });

          logger.info(`[manage_skills] Created skill '${id}' successfully`);

          return {
            results: [
              otherResult({
                success: true,
                operation: 'created',
                skill: { id: skill.id, name: skill.name },
              }),
            ],
          };
        }

        // update operation
        const existing = await skillRegistry.get(id);
        if (!existing) {
          return {
            results: [errorResult(`Skill with id '${id}' not found.`)],
          };
        }

        if (existing.readonly) {
          return {
            results: [errorResult(`Skill '${id}' is a built-in skill and cannot be modified.`)],
          };
        }

        const updatePayload: Record<string, unknown> = {};
        if (name !== undefined) updatePayload.name = name;
        if (description !== undefined) updatePayload.description = description;
        if (content !== undefined) updatePayload.content = content;
        if (toolIds !== undefined) updatePayload.tool_ids = toolIds;

        const skill = await skillRegistry.update(id, updatePayload as any);

        logger.info(`[manage_skills] Updated skill '${id}' successfully`);

        return {
          results: [
            otherResult({
              success: true,
              operation: 'updated',
              skill: { id: skill.id, name: skill.name },
            }),
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`[manage_skills] Failed to ${operation} skill '${id}': ${message}`);
        return {
          results: [errorResult(`Failed to ${operation} skill: ${message}`)],
        };
      }
    },
    tags: [],
  };
};
