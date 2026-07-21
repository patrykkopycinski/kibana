/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionDto, WorkflowStepExecutionDto } from '@kbn/workflows';
import { readAgentUsage, readAgentStepLatency } from './workflow_task';

const USAGE = { inputTokens: 100, outputTokens: 40, cachedTokens: 10, totalTokens: 140 };

const agentStep = (over: Partial<WorkflowStepExecutionDto> = {}): WorkflowStepExecutionDto =>
  ({ stepId: 'runAgent_step', stepType: 'ai.agent', ...over } as WorkflowStepExecutionDto);

const execution = (over: Partial<WorkflowExecutionDto> = {}): WorkflowExecutionDto =>
  ({ status: 'completed', stepExecutions: [], ...over } as unknown as WorkflowExecutionDto);

describe('readAgentUsage', () => {
  it('prefers the workflow-summed execution.usage', () => {
    const result = readAgentUsage(
      execution({
        usage: USAGE,
        // A different per-step value must be ignored when the summary exists.
        stepExecutions: [agentStep({ usage: { ...USAGE, totalTokens: 999 } })],
      })
    );
    expect(result).toEqual(USAGE);
  });

  it('falls back to the agent step usage when execution.usage is absent', () => {
    const result = readAgentUsage(execution({ stepExecutions: [agentStep({ usage: USAGE })] }));
    expect(result).toEqual(USAGE);
  });

  it('falls back to step output.metadata.usage when no typed usage exists', () => {
    const result = readAgentUsage(
      execution({ stepExecutions: [agentStep({ output: { metadata: { usage: USAGE } } })] })
    );
    expect(result).toEqual(USAGE);
  });

  it('ignores usage on non-agent steps', () => {
    const nonAgent = {
      stepId: 'other',
      stepType: 'console',
      usage: USAGE,
    } as WorkflowStepExecutionDto;
    expect(readAgentUsage(execution({ stepExecutions: [nonAgent] }))).toBeUndefined();
  });

  it('returns undefined when nothing reports usage', () => {
    expect(readAgentUsage(execution({ stepExecutions: [agentStep()] }))).toBeUndefined();
  });
});

describe('readAgentStepLatency', () => {
  it('takes the max executionTimeMs across agent-step records', () => {
    const steps = [agentStep({ executionTimeMs: 0 }), agentStep({ executionTimeMs: 4200 })];
    expect(readAgentStepLatency(steps)).toBe(4200);
  });

  it('ignores non-agent steps and missing timings', () => {
    const steps = [
      { stepId: 'other', stepType: 'console', executionTimeMs: 99999 } as WorkflowStepExecutionDto,
      agentStep({}),
    ];
    expect(readAgentStepLatency(steps)).toBeUndefined();
  });
});
