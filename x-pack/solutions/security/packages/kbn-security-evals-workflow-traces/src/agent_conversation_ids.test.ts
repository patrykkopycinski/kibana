/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  extractAgentConversationIds,
  extractFirstAgentConversationId,
} from './agent_conversation_ids';
import type { WorkflowStepExecutionDto } from '@kbn/workflows';

const step = (over: Partial<WorkflowStepExecutionDto>): WorkflowStepExecutionDto =>
  ({ stepId: 'draft_creation', ...over } as WorkflowStepExecutionDto);

describe('extractAgentConversationIds', () => {
  it('skips the step_level_timeout wrapper and reads the real ai.agent step', () => {
    const steps = [
      step({ stepType: 'step_level_timeout', output: undefined }),
      step({
        stepType: 'ai.agent',
        output: { conversation_id: '91ac5936-694f-4308-8b86-e41189e9a0cf', message: 'ok' },
      }),
    ];

    expect(extractAgentConversationIds(steps)).toEqual([
      {
        stepId: 'draft_creation',
        conversationId: '91ac5936-694f-4308-8b86-e41189e9a0cf',
        stepType: 'ai.agent',
      },
    ]);
  });

  it('returns every ai.agent conversation id in a multi-step workflow', () => {
    // draft → review → rewrite: each agent step opens its own conversation.
    const steps = [
      step({
        stepId: 'draft_creation',
        stepType: 'step_level_timeout',
        output: undefined,
      }),
      step({
        stepId: 'draft_creation',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-draft' },
      }),
      step({
        stepId: 'review_gate',
        stepType: 'wait_for_input',
        output: { approved: true },
      }),
      step({
        stepId: 'review_agent',
        stepType: 'step_level_timeout',
        output: undefined,
      }),
      step({
        stepId: 'review_agent',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-review' },
      }),
      step({
        stepId: 'rewrite_agent',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-rewrite' },
      }),
    ];

    expect(extractAgentConversationIds(steps)).toEqual([
      { stepId: 'draft_creation', conversationId: 'conv-draft', stepType: 'ai.agent' },
      { stepId: 'review_agent', conversationId: 'conv-review', stepType: 'ai.agent' },
      { stepId: 'rewrite_agent', conversationId: 'conv-rewrite', stepType: 'ai.agent' },
    ]);
  });

  it('dedupes identical conversation ids while preserving first-seen order', () => {
    const steps = [
      step({
        stepId: 'draft_creation',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-shared' },
      }),
      // A retried step reuses the conversation id; it must not be emitted twice.
      step({
        stepId: 'draft_creation',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-shared' },
      }),
      step({
        stepId: 'followup_agent',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-followup' },
      }),
    ];

    expect(extractAgentConversationIds(steps).map((r) => r.conversationId)).toEqual([
      'conv-shared',
      'conv-followup',
    ]);
  });

  it('returns an empty array when no step carries a conversation id', () => {
    const steps = [
      step({ stepType: 'step_level_timeout', output: undefined }),
      step({ stepId: 'if_review_creation', stepType: 'if', output: {} }),
    ];

    expect(extractAgentConversationIds(steps)).toEqual([]);
  });

  it('ignores a non-string or empty conversation_id', () => {
    const steps = [
      step({ stepType: 'ai.agent', output: { conversation_id: '' } }),
      step({ stepType: 'ai.agent', output: { conversation_id: 42 } }),
      step({ stepType: 'ai.agent', output: { conversation_id: null } }),
      step({
        stepId: 'real_agent',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-real' },
      }),
    ];

    expect(extractAgentConversationIds(steps)).toEqual([
      { stepId: 'real_agent', conversationId: 'conv-real', stepType: 'ai.agent' },
    ]);
  });
});

describe('extractAgentConversationIds trace_conversation_id fallback', () => {
  const includeTraceIds = { includeTraceIds: true };

  it('ignores metadata.trace_conversation_id by default and when the option is false', () => {
    const steps = [
      step({
        stepId: 'trace_only',
        stepType: 'ai.agent',
        output: { message: 'ok', metadata: { trace_conversation_id: 'trace-only' } },
      }),
      step({
        stepId: 'stored',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-1', metadata: { trace_conversation_id: 'trace-1' } },
      }),
    ];
    const expected = [{ stepId: 'stored', conversationId: 'conv-1', stepType: 'ai.agent' }];

    expect(extractAgentConversationIds(steps)).toEqual(expected);
    expect(extractAgentConversationIds(steps, { includeTraceIds: false })).toEqual(expected);
    expect(extractFirstAgentConversationId(steps)).toBe('conv-1');
  });

  it('reads metadata.trace_conversation_id when the step stored no conversation', () => {
    const steps = [
      step({ stepType: 'step_level_timeout', output: undefined }),
      step({
        stepId: 'endpoint_analysis',
        stepType: 'ai.agent',
        output: { message: 'ok', metadata: { trace_conversation_id: 'trace-only' } },
      }),
    ];

    expect(extractAgentConversationIds(steps, includeTraceIds)).toEqual([
      { stepId: 'endpoint_analysis', conversationId: 'trace-only', stepType: 'ai.agent' },
    ]);
  });

  it('prefers conversation_id over the trace id and dedupes when they are equal', () => {
    const steps = [
      step({
        stepId: 'stored_agent',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-1', metadata: { trace_conversation_id: 'conv-1' } },
      }),
      step({
        stepId: 'retry_agent',
        stepType: 'ai.agent',
        output: { metadata: { trace_conversation_id: 'conv-1' } },
      }),
      step({
        stepId: 'second_agent',
        stepType: 'ai.agent',
        output: { metadata: { trace_conversation_id: 'trace-2' } },
      }),
    ];

    expect(
      extractAgentConversationIds(steps, includeTraceIds).map((r) => r.conversationId)
    ).toEqual(['conv-1', 'trace-2']);
  });

  it('falls back when conversation_id is empty and ignores a non-string trace id', () => {
    const steps = [
      step({
        stepId: 'a',
        stepType: 'ai.agent',
        output: { conversation_id: '', metadata: { trace_conversation_id: 'trace-a' } },
      }),
      step({
        stepId: 'b',
        stepType: 'ai.agent',
        output: { metadata: { trace_conversation_id: 7 } },
      }),
      step({ stepId: 'c', stepType: 'ai.agent', output: { metadata: null } }),
    ];

    expect(extractAgentConversationIds(steps, includeTraceIds)).toEqual([
      { stepId: 'a', conversationId: 'trace-a', stepType: 'ai.agent' },
    ]);
  });
});

describe('extractFirstAgentConversationId', () => {
  it('returns only the first conversation id (single-agent convenience)', () => {
    const steps = [
      step({
        stepId: 'draft_creation',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-draft' },
      }),
      step({
        stepId: 'review_agent',
        stepType: 'ai.agent',
        output: { conversation_id: 'conv-review' },
      }),
    ];

    expect(extractFirstAgentConversationId(steps)).toBe('conv-draft');
  });

  it('returns undefined when no conversation id is present', () => {
    expect(extractFirstAgentConversationId([])).toBeUndefined();
  });
});
