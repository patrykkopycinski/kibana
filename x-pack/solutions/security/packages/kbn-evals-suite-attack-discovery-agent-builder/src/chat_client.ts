/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import pRetry from 'p-retry';
import type { AttackDiscovery } from './types';

export interface AgentBuilderConverseResponse {
  messages: Array<{ message: string }>;
  steps: Array<{ tool_id?: string; results?: unknown[]; [key: string]: unknown }>;
  errors: Array<{ error: { message: string; stack?: string }; type: 'error' }>;
  traceId?: string;
  insights?: AttackDiscovery[] | null;
}

const parseInsightsFromToolResult = (
  steps: AgentBuilderConverseResponse['steps'] | undefined
): AttackDiscovery[] | null => {
  // Prefer insights from the run tool's attack_discoveries field — this is the
  // canonical source, immune to message block ordering issues.
  if (!steps) {
    return null;
  }
  const adStep = steps.find(
    (
      step
    ): step is typeof step & { results?: Array<{ data?: { attack_discoveries?: unknown } }> } =>
      step.tool_id === 'security.attack-discovery.run' && step.type === 'tool_call'
  );
  const discoveries = adStep?.results?.[0]?.data?.attack_discoveries;
  if (Array.isArray(discoveries) && discoveries.length > 0) {
    return discoveries as AttackDiscovery[];
  }
  return null;
};

const parseInsightsFromMessage = (message: string): AttackDiscovery[] | null => {
  // Fallback: extract insights from the last ```json fenced block in the message.
  // This is fragile — if the model emits a proposed ES|QL rule after the insights
  // block, this grabs the wrong one. Prefer parseInsightsFromToolResult when available.
  const matches = message.match(/```json\s*([\s\S]*?)\s*```/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  // Search from the end backwards for a block containing "insights"
  for (let i = matches.length - 1; i >= 0; i--) {
    const block = matches[i].replace(/```json\s*/, '').replace(/\s*```/, '');
    try {
      const parsed = JSON.parse(block);
      if (parsed && Array.isArray(parsed.insights)) {
        return parsed.insights;
      }
    } catch {
      // not valid JSON, try next block
    }
  }
  return null;
};

export class AttackDiscoveryAgentBuilderChatClient {
  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly connectorId: string
  ) {}

  async converse(
    question: string,
    attachments: Array<{ type: 'security.alerts'; data: { alertIds: string[] } }> = [],
    _expectedSkills?: string[]
  ): Promise<AgentBuilderConverseResponse> {
    return pRetry(
      async () => {
        const body: Record<string, unknown> = {
          agent_id: agentBuilderDefaultAgentId,
          connector_id: this.connectorId,
          input: question,
          _execution_mode: 'local',
          attachments,
        };

        const response = (await this.fetch('/api/agent_builder/converse', {
          method: 'POST',
          version: '2023-10-31',
          body: JSON.stringify(body),
        })) as {
          trace_id?: string;
          steps?: AgentBuilderConverseResponse['steps'];
          response: { message: string };
        };

        return {
          messages: [{ message: response.response.message }],
          steps: response.steps ?? [],
          errors: [],
          traceId: response.trace_id,
          insights:
            parseInsightsFromToolResult(response.steps) ??
            parseInsightsFromMessage(response.response.message),
        };
      },
      {
        retries: 2,
        minTimeout: 2_000,
        onFailedAttempt: (error) =>
          this.log.warning(
            new Error(`Agent Builder converse failed on attempt ${error.attemptNumber}`, {
              cause: error,
            })
          ),
      }
    );
  }
}
