/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { extractConversationId } from './rule_creation_client';

/**
 * `conversation_id` is the join key that makes `Tool Routing` measurable: the agent invocation
 * opens its own root trace, so the workflow's `traceId` matches zero agent spans, while every
 * agent span carries `gen_ai.conversation.id`.
 *
 * The trap this pins: `draft_creation` appears TWICE in `stepExecutions` — first as the
 * `step_level_timeout` wrapper whose `output` is null, then as the real `ai.agent` step. Selecting
 * by stepId (or by taking the first match) picks the wrapper and silently yields undefined, which
 * degrades every example to N/A without any error.
 */
const step = (over: Partial<WorkflowStepExecutionDto>): WorkflowStepExecutionDto =>
  ({ stepId: 'draft_creation', ...over } as WorkflowStepExecutionDto);

describe('extractConversationId', () => {
  it('skips the step_level_timeout wrapper and reads the real ai.agent step', () => {
    const steps = [
      step({ stepType: 'step_level_timeout', output: undefined }),
      step({
        stepType: 'ai.agent',
        output: { conversation_id: '91ac5936-694f-4308-8b86-e41189e9a0cf', message: 'ok' },
      }),
    ];

    expect(extractConversationId(steps)).toBe('91ac5936-694f-4308-8b86-e41189e9a0cf');
  });

  it('returns undefined when no step carries a conversation id', () => {
    const steps = [
      step({ stepType: 'step_level_timeout', output: undefined }),
      step({ stepId: 'if_review_creation', stepType: 'if', output: {} }),
    ];

    expect(extractConversationId(steps)).toBeUndefined();
  });

  it('ignores a non-string or empty conversation id rather than returning a bad key', () => {
    expect(extractConversationId([step({ output: { conversation_id: '' } })])).toBeUndefined();
    expect(extractConversationId([step({ output: { conversation_id: 42 } })])).toBeUndefined();
  });
});
