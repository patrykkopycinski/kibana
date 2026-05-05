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
import { ARGUS_SOC_INDICES } from '@kbn/argus-console-common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_RUN_BACKTEST_TOOL_ID } from './constants';

const runBacktestSchema = z.object({
  rule_id: z.string().min(1).describe('ARGUS rule artifact id to backtest.'),
  lookback: z
    .enum(['24h', '7d', '14d', '30d'])
    .default('14d')
    .describe('Historical window to replay against.'),
  corpus_id: z
    .string()
    .optional()
    .describe('Specific `.soc-eval-corpus-*` id. Falls back to the rule corpus default.'),
});

/**
 * Dispatches a backtest by writing a run request into `.soc-argus-eval-runs`
 * (run_kind=backtest_request). Shadow / backtest workflows consume the queue
 * and file authoritative rows in `.soc-backtests`. This keeps the tool non-blocking — playbooks can
 * queue a backtest and continue without waiting on async ES work.
 */
export function argusRunBacktestTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof runBacktestSchema> {
  return {
    id: ARGUS_RUN_BACKTEST_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Queue a backtest for an ARGUS rule against the historical telemetry corpus. Returns the ' +
      'run_id; poll `.soc-backtests` or the console E2D panel to observe completion.',
    schema: runBacktestSchema,
    tags: ['security', 'argus', 'argus:playbook', 'backtest'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) =>
        getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async ({ rule_id: ruleId, lookback, corpus_id: corpusId }, { esClient }) => {
      const runId = `argus-bt-${Date.now().toString(36)}`;
      const doc = {
        '@timestamp': new Date().toISOString(),
        run_kind: 'backtest_request',
        type: 'backtest_request',
        run_id: runId,
        rule_id: ruleId,
        lookback,
        corpus_id: corpusId ?? null,
        status: 'queued',
        origin: 'playbook_tool',
      };

      try {
        await esClient.asCurrentUser.index({
          index: ARGUS_SOC_INDICES.detectionEvalRuns,
          id: runId,
          refresh: false,
          document: doc,
        });
        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Queued backtest ${runId} for rule ${ruleId}`,
                run_id: runId,
                rule_id: ruleId,
                status: 'queued',
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.run_backtest failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to queue backtest: ${
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
