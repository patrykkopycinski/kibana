/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { readAgentToolCallsFromTraces } from '@kbn/security-evals-workflow-traces';
import { readAgentToolCallsForSteps } from './agent_trace_conversation_ids';

jest.mock('@kbn/security-evals-workflow-traces', () => ({
  ...jest.requireActual('@kbn/security-evals-workflow-traces'),
  readAgentToolCallsFromTraces: jest.fn(),
}));

const readTraces = readAgentToolCallsFromTraces as jest.MockedFunction<
  typeof readAgentToolCallsFromTraces
>;

const step = (over: Partial<WorkflowStepExecutionDto>): WorkflowStepExecutionDto =>
  ({ stepId: 'forensic_analysis', ...over } as WorkflowStepExecutionDto);

const log = {} as Parameters<typeof readAgentToolCallsForSteps>[0]['log'];
const traceEsClient = {} as Parameters<typeof readAgentToolCallsForSteps>[0]['traceEsClient'];

describe('readAgentToolCallsForSteps', () => {
  beforeEach(() => {
    readTraces.mockReset();
    readTraces.mockResolvedValue({
      toolCallIds: ['security.endpoint_forensic.x'],
      unavailable: false,
    });
  });

  it('throws without reading traces when no ai.agent step reports an id', async () => {
    const stepExecutions = [
      // The journal step's investigation id has no agent span.
      step({ stepType: 'workflow.execute', output: { conversation_id: 'investigation' } }),
      step({ stepType: 'ai.agent', output: { metadata: {} } }),
    ];

    await expect(
      readAgentToolCallsForSteps({ stepExecutions, traceEsClient, log })
    ).rejects.toThrow(/No ai\.agent step reported a trace conversation id/);
    expect(readTraces).not.toHaveBeenCalled();
  });

  it('passes the ai.agent trace ids through to the trace reader', async () => {
    const stepExecutions = [
      step({ stepType: 'workflow.execute', output: { conversation_id: 'investigation' } }),
      step({
        stepType: 'ai.agent',
        output: { metadata: { trace_conversation_id: 'trace-1' } },
      }),
    ];

    const result = await readAgentToolCallsForSteps({
      stepExecutions,
      traceEsClient,
      log,
      includeFailures: true,
    });

    expect(readTraces).toHaveBeenCalledWith({
      traceEsClient,
      log,
      includeFailures: true,
      conversationIds: ['trace-1'],
    });
    expect(result.toolCallIds).toEqual(['security.endpoint_forensic.x']);
  });
});
