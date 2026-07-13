/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import { ToolType } from '@kbn/agent-builder-common';

export const ENDPOINT_RESPONSE_ACTIONS_SKILL_ID = 'endpoint-response-actions';
export const ENDPOINT_FORENSIC_ANALYSIS_SKILL_ID = 'endpoint-forensic-analysis';
export const ENDPOINT_FORENSIC_DISCOVER_TELEMETRY_TOOL_ID =
  'security.endpoint_forensic.discover_telemetry';

export interface ExecuteSkillBoundedToolParams {
  skillId: string;
  toolId: string;
  toolParams: Record<string, unknown>;
}

export interface ExecuteSkillBoundedToolOptions {
  esClient?: IScopedClusterClient;
  agentId?: string;
}

/** Execute a bounded inline tool from a registered Agent Builder skill. */
export const executeSkillBoundedTool = async (
  agentBuilder: AgentBuilderPluginStart,
  request: KibanaRequest,
  spaceId: string,
  logger: Logger,
  params: ExecuteSkillBoundedToolParams,
  options: ExecuteSkillBoundedToolOptions = {}
): Promise<unknown> => {
  const registry = await agentBuilder.skills.getRegistry({ request });
  const skill = await registry.get(params.skillId);
  if (!skill) {
    throw new Error(`Skill '${params.skillId}' not found`);
  }

  const inlineTools = await skill.getInlineTools?.();
  const tool = inlineTools?.find((entry) => entry.id === params.toolId);
  if (!tool || tool.type !== ToolType.builtin || !('handler' in tool)) {
    throw new Error(`Tool '${params.toolId}' not found on skill '${params.skillId}'`);
  }

  const handlerContext = {
    logger,
    request,
    spaceId,
    esClient: options.esClient,
    runContext: {
      runId: `daybreak-${params.toolId}`,
      stack: [
        {
          type: 'agent',
          agentId: options.agentId ?? 'daybreak-worker',
          conversationId: `daybreak-skill-${Date.now()}`,
        },
      ],
    },
  } as ToolHandlerContext;

  return tool.handler(params.toolParams, handlerContext);
};
