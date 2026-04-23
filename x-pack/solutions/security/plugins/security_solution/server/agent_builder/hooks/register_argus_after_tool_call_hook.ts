/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { HookExecutionMode, HookLifecycle } from '@kbn/agent-builder-common';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import type { AfterToolCallHookContext, RunToolReturn } from '@kbn/agent-builder-server';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { Logger } from '@kbn/logging';
import type { ExperimentalFeatures } from '../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';

const AUDIT_TRAIL_INDEX = '.soc-audit-trail';

/** Patterns for credential-shaped strings; replace matches with [REDACTED]. */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}\b/gi,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g,
  /\bsk-[a-zA-Z0-9]{20,}\b/g,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
  /(?:(?:api|access)[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"&]{6,}['"]?/gi,
];

export interface RegisterArgusAfterToolCallHookDeps {
  logger: Logger;
  experimentalFeatures: ExperimentalFeatures;
  getStartServices: SecuritySolutionPluginCoreSetupDependencies['getStartServices'];
}

const redactString = (value: string): string => {
  let out = value;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, '[REDACTED]');
  }
  return out;
};

const redactUnknown = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactUnknown);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      next[k] = redactUnknown(v);
    }
    return next;
  }
  return value;
};

const looksLikeAlertDocument = (obj: Record<string, unknown>): boolean => {
  if ('kibana.alert.uuid' in obj || 'kibana.alert.rule.uuid' in obj) {
    return true;
  }
  if (typeof obj.event === 'object' && obj.event !== null && 'kind' in (obj.event as object)) {
    return true;
  }
  return typeof obj.host === 'object' || typeof obj.user === 'object';
};

const pickTimestamp = (obj: Record<string, unknown>): string | undefined => {
  if (typeof obj['@timestamp'] === 'string') {
    return obj['@timestamp'];
  }
  if (typeof obj.timestamp === 'string') {
    return obj.timestamp;
  }
  const kibana = obj.kibana;
  if (kibana && typeof kibana === 'object' && kibana !== null) {
    const alert = (kibana as Record<string, unknown>).alert;
    if (alert && typeof alert === 'object' && alert !== null) {
      const start = (alert as Record<string, unknown>).start_time;
      if (typeof start === 'string') {
        return start;
      }
    }
  }
  return undefined;
};

const pickHostName = (obj: Record<string, unknown>): string | undefined => {
  if (typeof obj['host.name'] === 'string') {
    return obj['host.name'];
  }
  const host = obj.host;
  if (host && typeof host === 'object' && host !== null) {
    const name = (host as Record<string, unknown>).name;
    if (typeof name === 'string') {
      return name;
    }
  }
  return undefined;
};

const pickUserName = (obj: Record<string, unknown>): string | undefined => {
  if (typeof obj['user.name'] === 'string') {
    return obj['user.name'];
  }
  const user = obj.user;
  if (user && typeof user === 'object' && user !== null) {
    const name = (user as Record<string, unknown>).name;
    if (typeof name === 'string') {
      return name;
    }
  }
  return undefined;
};

const normalizeAlertFieldsInPlace = (obj: Record<string, unknown>): void => {
  if (!looksLikeAlertDocument(obj)) {
    return;
  }
  const ts = pickTimestamp(obj);
  const hostName = pickHostName(obj);
  const userName = pickUserName(obj);
  if (ts !== undefined) {
    obj['@timestamp'] = ts;
  }
  if (hostName !== undefined) {
    obj['host.name'] = hostName;
  }
  if (userName !== undefined) {
    obj['user.name'] = userName;
  }
};

const normalizeContentNode = (node: unknown): void => {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      normalizeContentNode(item);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  normalizeAlertFieldsInPlace(obj);
  for (const v of Object.values(obj)) {
    normalizeContentNode(v);
  }
};

const processToolReturn = (toolReturn: RunToolReturn): RunToolReturn => {
  const cloned = redactUnknown(toolReturn) as RunToolReturn;
  if (!cloned.results) {
    return cloned;
  }
  for (const result of cloned.results) {
    if (result.type === ToolResultType.resource) {
      normalizeContentNode(result.data.content);
    }
    if (result.type === ToolResultType.resourceList) {
      for (const res of result.data.resources) {
        normalizeContentNode(res.content);
      }
    }
    if (result.type === ToolResultType.esqlResults) {
      for (const row of result.data.values) {
        for (const cell of row) {
          if (cell !== null && typeof cell === 'object') {
            normalizeContentNode(cell);
          }
        }
      }
    }
    if (result.type === ToolResultType.other) {
      normalizeContentNode(result.data);
    }
  }
  return cloned;
};

/**
 * Limit afterToolCall redaction/audit to ARGUS console agents/tools so other
 * Agent Builder workflows are unaffected when the feature flag is on.
 */
const isArgusScopedToolOrAgent = (toolId: string, agentId: string): boolean => {
  const t = toolId.toLowerCase();
  if (t.startsWith('argus') || t.startsWith('security.argus')) {
    return true;
  }
  return agentId.toLowerCase().includes('argus');
};

const appendAuditTrail = async (
  es: {
    index: (params: Record<string, unknown>) => Promise<unknown>;
  },
  doc: Record<string, unknown>
): Promise<void> => {
  await es.index({
    index: AUDIT_TRAIL_INDEX,
    document: {
      '@timestamp': new Date().toISOString(),
      event_type: 'argus_agent_builder_tool',
      source: 'agent_builder_argus_after_tool',
      pipeline: 'security_solution',
      ...doc,
    },
    refresh: false,
  });
};

export const registerArgusAfterToolCallHook = (
  agentBuilder: AgentBuilderPluginSetup,
  deps: RegisterArgusAfterToolCallHookDeps
): void => {
  if (!deps.experimentalFeatures.argusConsoleEnabled) {
    deps.logger.debug('ARGUS afterToolCall hook skipped: argusConsoleEnabled is off');
    return;
  }

  const logger = deps.logger.get('argusAfterToolCallHook');

  agentBuilder.hooks.register({
    id: 'argus-after-tool-call',
    priority: 100,
    hooks: {
      [HookLifecycle.afterToolCall]: {
        mode: HookExecutionMode.blocking,
        handler: async (context: AfterToolCallHookContext) => {
          const hookStarted = Date.now();
          try {
            if (!isArgusScopedToolOrAgent(context.toolId, context.agentId ?? '')) {
              return;
            }

            const processed = processToolReturn(context.toolReturn);
            const resultSize = JSON.stringify(processed).length;

            try {
              const [{ elasticsearch }] = await deps.getStartServices();
              const esClient = elasticsearch.client.asScoped(context.request).asCurrentUser;
              await appendAuditTrail(esClient, {
                status: 'ok',
                action: 'after_tool_call',
                agent_name: context.agentId,
                details: {
                  tool_id: context.toolId,
                  tool_call_id: context.toolCallId,
                  result_size: resultSize,
                  duration_ms: Date.now() - hookStarted,
                  duration_scope: 'after_tool_hook_processing',
                },
              });
            } catch (auditErr) {
              logger.warn(`ARGUS afterToolCall audit write failed: ${String(auditErr)}`);
            }

            return { toolReturn: processed };
          } catch (err) {
            logger.warn(`ARGUS afterToolCall hook failed (non-blocking): ${String(err)}`);
          }
        },
      },
    },
  });
};
