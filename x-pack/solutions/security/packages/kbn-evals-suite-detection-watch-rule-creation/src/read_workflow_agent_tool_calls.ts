/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import pRetry from 'p-retry';

const FILESTORE_READ = 'filestore.read';

interface EsqlResponse {
  columns: Array<{ name: string; type: string }>;
  values: unknown[][];
}

/**
 * Ordered tool calls for one agent conversation.
 *
 * Joined on `gen_ai.conversation.id`, NOT on the workflow's trace id. The agent invocation opens
 * its own root trace, so the workflow's trace id matches zero agent spans — that mismatch is what
 * made this evaluator report N/A on every example. The `ai.agent` step already returns
 * `conversation_id` in its step output (the workflow sets `create-conversation`), and the agent's
 * tool spans carry the same value, so no platform change is needed to correlate them.
 *
 * Verified 2026-08-11 against the golden cluster: 7/7 executions resolved, 0 N/A.
 *
 * `LIMIT` is explicit because ES|QL otherwise applies an implicit 1000-row default and truncates
 * silently. Truncation here is not a visible failure — it drops the tail of a trajectory and scores
 * routing against a partial tool sequence, which reads as a real result. The busiest conversation
 * observed on the golden cluster used 483 tool spans (2026-08-12), so this ceiling clears current
 * traffic with headroom while keeping the bound explicit rather than inherited.
 */
const TOOL_SPAN_LIMIT = 10_000;

const buildOrderedToolQuery = (conversationId: string, indexPattern: string) =>
  `
FROM ${indexPattern}
| WHERE attributes.gen_ai.conversation.id == "${conversationId}"
  AND attributes.elastic.inference.span.kind == "TOOL"
| SORT @timestamp ASC
| EVAL tool_id = COALESCE(attributes.gen_ai.tool.name, name)
| WHERE tool_id IS NOT NULL
  AND tool_id != "${FILESTORE_READ}"
| EVAL tool_failed = status.code == "Error"
| KEEP @timestamp, tool_id, tool_failed
| LIMIT ${TOOL_SPAN_LIMIT}
`.trim();

const buildSpanProbeQuery = (conversationId: string) =>
  `
FROM traces-*
| WHERE attributes.gen_ai.conversation.id == "${conversationId}"
| STATS span_count = COUNT(*)
`.trim();

const parseToolIds = (response: EsqlResponse): string[] => {
  const toolCol = response.columns.findIndex((column) => column.name === 'tool_id');
  if (toolCol === -1) {
    return [];
  }

  return response.values
    .map((row) => row[toolCol])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
};

/**
 * Tool ids whose span reported `status.code == "Error"`.
 *
 * A tool that was *called* is not a tool that *worked*. Measured 2026-08-11: 12 of 16
 * `security.create_detection_rule` calls in one run failed with
 * "Could not discover a suitable index for the query", and the agent retried three times per
 * example before giving up. Scoring on call-membership alone reports that as a routing success.
 */
const parseFailedToolIds = (response: EsqlResponse): string[] => {
  const toolCol = response.columns.findIndex((column) => column.name === 'tool_id');
  const failedCol = response.columns.findIndex((column) => column.name === 'tool_failed');
  if (toolCol === -1 || failedCol === -1) {
    return [];
  }

  return response.values
    .filter((row) => row[failedCol] === true)
    .map((row) => row[toolCol])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
};

// Copied from {@link ../../kbn-evals-suite-alert-analysis-workflow/src/read_workflow_agent_tool_calls.ts}.
// Copied rather than shared: the two suites are cohort-isolated with separate lifecycles, and a
// shared kbn-evals-*-common package is not warranted for one file. Divergence here: `traceEsClient`
// is optional so a stack booted without a trace ES reports N/A instead of throwing.
export const readWorkflowAgentToolCalls = async ({
  traceEsClient,
  conversationId,
  log,
  // `traces-*`, not `traces-agent_builder.*`: measured 2026-08-11 against the golden cluster,
  // agent tool spans land in the `generic.otel` dataset, so the narrower pattern matched ZERO
  // documents and every lookup reported `unavailable` regardless of what the agent actually did.
  indexPattern = 'traces-*',
}: {
  traceEsClient: EsClient | undefined;
  conversationId: string | undefined;
  log: ToolingLog;
  indexPattern?: string;
}): Promise<{ toolCallIds: string[]; failedToolCallIds: string[]; unavailable: boolean }> => {
  if (!traceEsClient || !conversationId) {
    return { toolCallIds: [], failedToolCallIds: [], unavailable: true };
  }

  const fetch = async (): Promise<{ toolCallIds: string[]; failedToolCallIds: string[] }> => {
    const probe = (await traceEsClient.esql.query({
      query: buildSpanProbeQuery(conversationId),
    })) as unknown as EsqlResponse;

    const spanCount = (probe.values[0]?.[0] as number) ?? 0;
    if (spanCount === 0) {
      throw new Error(`No spans yet for conversation ${conversationId}`);
    }

    const tools = (await traceEsClient.esql.query({
      query: buildOrderedToolQuery(conversationId, indexPattern),
    })) as unknown as EsqlResponse;

    return { toolCallIds: parseToolIds(tools), failedToolCallIds: parseFailedToolIds(tools) };
  };

  try {
    const result = await pRetry(fetch, {
      retries: 5,
      factor: 2,
      minTimeout: 2000,
      maxTimeout: 60_000,
      onFailedAttempt: (error) => {
        log.warning(
          `Tool-call trace query attempt ${error.attemptNumber} for conversation ${conversationId}; retrying...`
        );
      },
    });

    return { ...result, unavailable: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warning(`Could not resolve tool calls for conversation ${conversationId}: ${message}`);
    return { toolCallIds: [], failedToolCallIds: [], unavailable: true };
  }
};
