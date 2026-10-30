/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { strict as assert } from 'assert';
import {
  extractAgentConversationIds,
  readAgentToolCallsFromTraces,
} from '@kbn/security-evals-workflow-traces';
import type { ReadAgentToolCallsFromTracesParams } from '@kbn/security-evals-workflow-traces';

type StepExecutions = Parameters<typeof extractAgentConversationIds>[0];

/**
 * Reads the tool calls of the `ai.agent` steps from traces, failing when no step reports an id.
 * The journal `workflow.execute` steps also output the investigation's `conversation_id`, which
 * no agent span carries, so only `ai.agent` steps count.
 */
export const readAgentToolCallsForSteps = async ({
  stepExecutions,
  ...params
}: Omit<ReadAgentToolCallsFromTracesParams, 'conversationIds'> & {
  stepExecutions: StepExecutions;
}) => {
  const conversationIds = extractAgentConversationIds(stepExecutions, { includeTraceIds: true })
    .filter((entry) => entry.stepType === 'ai.agent')
    .map((entry) => entry.conversationId);
  assert(
    conversationIds.length > 0,
    'No ai.agent step reported a trace conversation id (output.conversation_id or output.metadata.trace_conversation_id); the trace check cannot run'
  );
  return readAgentToolCallsFromTraces({ ...params, conversationIds });
};
