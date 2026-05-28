/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationDataset, EvalsExecutorClient, Example, ExperimentTask } from '@kbn/evals';
import { platformCoreTools } from '@kbn/agent-builder-common';
import { tags } from '@kbn/scout';
import type { AgentBuilderEvaluationChatClient } from '../../src/chat_client';
import { evaluate as base } from '../../src/evaluate';

type DatasetExample = Example<
  { question: string; index: string },
  { expectedFromTarget: string },
  { query_intent?: string }
>;

interface ToolResult {
  data?: { esql?: string };
  type?: string;
}

interface ToolTaskOutput {
  results: unknown[];
  errors: unknown[];
  esql: string;
}

/**
 * Extract the FROM target from an ES|QL query string.
 * Handles optional cluster prefix (e.g. `remote:index`).
 */
function extractFromTarget(esql: string): string | null {
  const match = esql.match(/\bFROM\s+(?:[\w-]+:)?([^\s,|]+)/i);
  return match ? match[1] : null;
}

export type EvaluateDataset = (params: {
  dataset: { name: string; description: string; examples: DatasetExample[] };
}) => Promise<void>;

function createEvaluateFromClauseDataset({
  executorClient,
  chatClient,
}: {
  executorClient: EvalsExecutorClient;
  chatClient: AgentBuilderEvaluationChatClient;
}): EvaluateDataset {
  return async function evaluateDataset({ dataset: { name, description, examples } }) {
    const dataset = { name, description, examples } satisfies EvaluationDataset;

    const task: ExperimentTask<DatasetExample, ToolTaskOutput> = async ({ input }) => {
      const response = await chatClient.executeTool({
        toolId: platformCoreTools.generateEsql,
        toolParams: {
          query: input!.question,
          index: input!.index,
          execute_query: false, // AST validation only — no live index needed
        },
      });

      const esql = (response.results as ToolResult[])
        .filter((r) => r.type === 'query')
        .map((r) => r.data?.esql)
        .filter(Boolean)
        .join('\n');

      return {
        results: response.results,
        errors: response.errors,
        esql,
      };
    };

    await executorClient.runExperiment(
      {
        dataset,
        task,
      },
      [
        {
          name: 'FromClauseCorrectness',
          kind: 'CODE' as const,
          evaluate: async ({ output, expected }) => {
            const esql = (output as ToolTaskOutput)?.esql ?? '';
            const expectedTarget = (expected as { expectedFromTarget?: string })
              ?.expectedFromTarget;

            if (!expectedTarget) {
              return { score: 1 };
            }

            if (!esql) {
              return {
                score: 0,
                metadata: { reason: 'No ES|QL query generated', expectedTarget },
              };
            }

            const actualTarget = extractFromTarget(esql);

            if (!actualTarget) {
              return {
                score: 0,
                metadata: { reason: 'No FROM clause found in query', esql, expectedTarget },
              };
            }

            const matches = actualTarget === expectedTarget;
            return {
              score: matches ? 1 : 0,
              metadata: {
                expectedTarget,
                actualTarget,
                esql,
                ...(matches ? {} : { reason: 'FROM clause target mismatch' }),
              },
            };
          },
        },
        {
          name: 'QueryGenerated',
          kind: 'CODE' as const,
          evaluate: async ({ output }) => {
            const taskOutput = output as ToolTaskOutput;
            const hasQuery = Boolean(taskOutput?.esql);
            const hasErrors = (taskOutput?.errors?.length ?? 0) > 0;
            return {
              score: hasQuery && !hasErrors ? 1 : 0,
              metadata: {
                hasQuery,
                hasErrors,
                errorCount: taskOutput?.errors?.length ?? 0,
              },
            };
          },
        },
      ]
    );
  };
}

const evaluate = base.extend<{ evaluateDataset: EvaluateDataset }, {}>({
  evaluateDataset: [
    async ({ chatClient, executorClient }, use) => {
      await use(
        createEvaluateFromClauseDataset({
          chatClient,
          executorClient,
        })
      );
    },
    { scope: 'test' },
  ],
});

evaluate.describe(
  'ES|QL FROM clause healing',
  { tag: tags.serverless.search },
  () => {
    evaluate(
      'dot-prefixed index targets are preserved in FROM clause',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'esql: from-clause-healing-dot-prefix',
            description:
              'Validates that the generate_esql tool preserves dot-prefixed index targets (e.g. .alerts-security.alerts-*) in the FROM clause instead of hallucinating alternatives',
            examples: [
              {
                input: {
                  question: 'Show me all critical severity alerts from the last 24 hours',
                  index: '.alerts-security.alerts-*',
                },
                output: {
                  expectedFromTarget: '.alerts-security.alerts-*',
                },
                metadata: {
                  query_intent: 'Alert query with dot-prefixed index',
                },
              },
              {
                input: {
                  question: 'Count the number of alerts grouped by kibana.alert.rule.name',
                  index: '.alerts-security.alerts-*',
                },
                output: {
                  expectedFromTarget: '.alerts-security.alerts-*',
                },
                metadata: {
                  query_intent: 'Alert aggregation with dot-prefixed index',
                },
              },
              {
                input: {
                  question:
                    'Find alerts where host.name is "web-server-01" and kibana.alert.severity is "high"',
                  index: '.alerts-security.alerts-*',
                },
                output: {
                  expectedFromTarget: '.alerts-security.alerts-*',
                },
                metadata: {
                  query_intent: 'Alert filter with dot-prefixed index',
                },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'standard index targets are preserved in FROM clause',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'esql: from-clause-healing-standard-indices',
            description:
              'Validates that standard (non-dot-prefixed) index targets are also preserved correctly in the FROM clause',
            examples: [
              {
                input: {
                  question: 'Show me the top 10 source IPs by event count',
                  index: 'logs-*',
                },
                output: {
                  expectedFromTarget: 'logs-*',
                },
                metadata: {
                  query_intent: 'Standard wildcard index',
                },
              },
              {
                input: {
                  question: 'List all unique user.name values',
                  index: '.ds-logs-endpoint.events.process-default',
                },
                output: {
                  expectedFromTarget: '.ds-logs-endpoint.events.process-default',
                },
                metadata: {
                  query_intent: 'Data stream with dot prefix',
                },
              },
              {
                input: {
                  question: 'Get the most recent 5 events sorted by timestamp',
                  index: 'metrics-system.cpu-default',
                },
                output: {
                  expectedFromTarget: 'metrics-system.cpu-default',
                },
                metadata: {
                  query_intent: 'Metrics data stream',
                },
              },
            ],
          },
        });
      }
    );
  }
);
