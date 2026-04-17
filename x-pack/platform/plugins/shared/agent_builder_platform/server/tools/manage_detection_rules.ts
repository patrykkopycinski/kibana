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

const DETECTION_ENGINE_RULES_URL = '/api/detection_engine/rules';
const DETECTION_ENGINE_RULES_BULK_ACTION = '/api/detection_engine/rules/_bulk_action';

const manageDetectionRulesSchema = z.object({
  operation: z
    .enum(['create', 'enable', 'disable', 'delete', 'patch'])
    .describe('The operation to perform on detection rules'),
  rule: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Full rule definition for create operation. Must include type (query, threshold, eql, etc.), name, description, risk_score, severity, and query/language. Set enabled=false to create as disabled for review.'
    ),
  rule_id: z
    .string()
    .min(1)
    .optional()
    .describe('The stable rule_id (not the SO id) for enable/disable/delete/patch operations'),
  id: z
    .string()
    .min(1)
    .optional()
    .describe('The saved object ID of the rule for enable/disable/delete/patch operations'),
  patch_fields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Fields to patch on the rule (for patch operation). Partial update — only provided fields change.'
    ),
});

export const manageDetectionRulesTool = (
  coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>
): BuiltinToolDefinition<typeof manageDetectionRulesSchema> => {
  const serverInfo = coreSetup.http.getServerInfo();
  const serverOrigin = `${serverInfo.protocol}://localhost:${serverInfo.port}`;

  return {
    id: platformCoreTools.manageDetectionRules,
    type: ToolType.builtin,
    description: cleanPrompt(`Manage Elastic Security detection rules programmatically.

    Supports the following operations:
    - **create**: Create a new detection rule. Provide the full rule definition in the 'rule' field.
      Set enabled=false to create as disabled for human review before activation.
      Required fields: type, name, description, risk_score, severity, and type-specific fields (e.g. query + language for query rules).
    - **enable**: Enable a detection rule by rule_id or id.
    - **disable**: Disable a detection rule by rule_id or id.
    - **delete**: Delete a detection rule by rule_id or id.
    - **patch**: Partially update a detection rule. Provide rule_id or id plus patch_fields with the fields to change.

    Returns the rule definition or operation result.
    `),
    schema: manageDetectionRulesSchema,
    handler: async (
      { operation, rule, rule_id: ruleId, id: ruleObjectId, patch_fields: patchFields },
      { request, logger }
    ) => {
      try {
        const [coreStart] = await coreSetup.getStartServices();
        const { basePath } = coreStart.http;

        const callKibana = async (
          method: 'get' | 'post' | 'put' | 'patch' | 'delete',
          path: string,
          body?: unknown,
          query?: Record<string, string>
        ) => {
          const fullPath = basePath.get(request) + path;
          const url = new URL(`${serverOrigin}${fullPath}`);
          if (query) {
            Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
          }

          const headers: Record<string, string> = {
            'kbn-xsrf': 'true',
            'elastic-api-version': '2023-10-31',
          };

          const requestHeaders = request.headers;
          if (requestHeaders.authorization) {
            headers.authorization = requestHeaders.authorization as string;
          }
          if (requestHeaders.cookie) {
            headers.cookie = requestHeaders.cookie as string;
          }

          const fetchOptions: RequestInit = {
            method: method.toUpperCase(),
            headers,
          };
          if (body) {
            fetchOptions.body = JSON.stringify(body);
            headers['content-type'] = 'application/json';
          }

          const response = await fetch(url.toString(), fetchOptions);
          let responseBody: Record<string, unknown>;
          try {
            responseBody = await response.json();
          } catch (_parseErr) {
            throw new Error(`HTTP ${response.status}: response body was not valid JSON`);
          }

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${responseBody?.message ?? JSON.stringify(responseBody)}`
            );
          }
          return responseBody;
        };

        switch (operation) {
          case 'create': {
            if (!rule) {
              return {
                results: [errorResult('Create operation requires the "rule" field.')],
              };
            }
            const created = await callKibana('post', DETECTION_ENGINE_RULES_URL, rule);
            logger.info(
              `[manage_detection_rules] Created rule '${created.name}' (id: ${created.id})`
            );
            return {
              results: [
                otherResult({
                  success: true,
                  operation: 'created',
                  rule: {
                    id: created.id,
                    rule_id: created.rule_id,
                    name: created.name,
                    enabled: created.enabled,
                  },
                }),
              ],
            };
          }

          case 'enable':
          case 'disable': {
            const targetId = ruleObjectId ?? ruleId;
            if (!targetId) {
              return {
                results: [
                  errorResult(
                    `${operation} requires either 'id' or 'rule_id' to identify the rule.`
                  ),
                ],
              };
            }
            const ids = ruleObjectId ? [ruleObjectId] : undefined;
            const body: Record<string, unknown> = { action: operation };
            if (ids) {
              body.ids = ids;
            } else {
              body.query = `alert.attributes.params.ruleId: "${ruleId}"`;
            }
            const result = await callKibana('post', DETECTION_ENGINE_RULES_BULK_ACTION, body);
            logger.info(`[manage_detection_rules] ${operation}d rule (target: ${targetId})`);
            return {
              results: [
                otherResult({
                  success: true,
                  operation: `${operation}d`,
                  rules_processed:
                    (
                      (result.attributes as Record<string, unknown> | undefined)?.summary as
                        | Record<string, unknown>
                        | undefined
                    )?.total ?? 1,
                }),
              ],
            };
          }

          case 'delete': {
            if (!ruleObjectId && !ruleId) {
              return {
                results: [errorResult('Delete requires either "id" or "rule_id".')],
              };
            }
            const query: Record<string, string> = {};
            if (ruleObjectId) query.id = ruleObjectId;
            else if (ruleId) query.rule_id = ruleId;

            await callKibana('delete', DETECTION_ENGINE_RULES_URL, undefined, query);
            logger.info(`[manage_detection_rules] Deleted rule (id: ${ruleObjectId ?? ruleId})`);
            return {
              results: [
                otherResult({
                  success: true,
                  operation: 'deleted',
                  target: ruleObjectId ?? ruleId,
                }),
              ],
            };
          }

          case 'patch': {
            if (!ruleObjectId && !ruleId) {
              return {
                results: [errorResult('Patch requires either "id" or "rule_id".')],
              };
            }
            if (!patchFields) {
              return {
                results: [errorResult('Patch requires "patch_fields" with the fields to update.')],
              };
            }
            const patchBody: Record<string, unknown> = { ...patchFields };
            if (ruleObjectId) patchBody.id = ruleObjectId;
            else if (ruleId) patchBody.rule_id = ruleId;

            const patched = await callKibana('patch', DETECTION_ENGINE_RULES_URL, patchBody);
            logger.info(
              `[manage_detection_rules] Patched rule '${patched.name}' (id: ${patched.id})`
            );
            return {
              results: [
                otherResult({
                  success: true,
                  operation: 'patched',
                  rule: {
                    id: patched.id,
                    rule_id: patched.rule_id,
                    name: patched.name,
                    enabled: patched.enabled,
                  },
                }),
              ],
            };
          }

          default:
            return {
              results: [errorResult(`Unknown operation: ${operation}`)],
            };
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`[manage_detection_rules] Failed: ${message}`);
        return {
          results: [errorResult(`Failed to ${operation} detection rule: ${message}`)],
        };
      }
    },
    tags: [],
  };
};
