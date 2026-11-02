/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateInsights, runAttackDiscovery } from './run_attack_discovery';
import type { AttackDiscoveryWorkflowApiClient } from '../clients/attack_discovery_workflow_api_client';
import type { BoundInferenceClient } from '@kbn/inference-common';

const FENCED_JSON_REPLY = [
  'Here are the insights:',
  '```json',
  '{"insights":[{"title":"Suspicious login","summaryMarkdown":"**sum**","detailsMarkdown":"**det**","alertIds":["a-1"]}]}',
  '```',
].join('\n');

const log = { debug: jest.fn() } as unknown as Parameters<typeof generateInsights>[0]['log'];

const createInferenceClient = (reply: string) => {
  const chatComplete = jest.fn(
    async (_request: { messages: Array<{ role: string; content: string }> }) => ({
      content: reply,
    })
  );
  const inferenceClient = { chatComplete } as unknown as BoundInferenceClient;
  return { inferenceClient, chatComplete };
};

describe('generateInsights', () => {
  it('sends the model the product request shape: no tools, no toolChoice', async () => {
    const { inferenceClient, chatComplete } = createInferenceClient(FENCED_JSON_REPLY);

    await generateInsights({
      inferenceClient,
      log,
      prompt: 'Analyze the alerts.',
      alerts: ['alert one', 'alert two'],
    });

    expect(chatComplete).toHaveBeenCalledTimes(1);
    const request = chatComplete.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    if (request == null) throw new Error('chatComplete was not called');
    expect(request).not.toHaveProperty('tools');
    expect(request).not.toHaveProperty('toolChoice');

    const message = request.messages[0];
    if (message == null) throw new Error('request had no messages');
    expect(message.role).toBe('user');
    // the product generation prompt: format instructions + combined query
    expect(message.content).toContain('JSON Schema');
    expect(message.content).toContain('Analyze the alerts.');
    expect(message.content).toContain('alert one');
    expect(message.content).toContain('alert two');
  });

  it('parses a fenced ```json reply with valid insights', async () => {
    const { inferenceClient } = createInferenceClient(FENCED_JSON_REPLY);

    const { insights } = await generateInsights({
      inferenceClient,
      log,
      prompt: 'Analyze the alerts.',
      alerts: ['alert one'],
    });

    expect(insights).toEqual([
      {
        title: 'Suspicious login',
        summaryMarkdown: '**sum**',
        detailsMarkdown: '**det**',
        alertIds: ['a-1'],
      },
    ]);
  });

  it('fails like the product when the reply has no parseable JSON', async () => {
    const { inferenceClient, chatComplete } = createInferenceClient(
      'These alerts look related, but I cannot structure them.'
    );

    await expect(
      generateInsights({
        inferenceClient,
        log,
        prompt: 'Analyze the alerts.',
        alerts: ['alert one'],
      })
    ).rejects.toThrow(/Failed to parse insights from the LLM response after 3 attempts/);

    expect(chatComplete).toHaveBeenCalledTimes(3);
  });

  it('combines a continuation reply with the partial results before parsing', async () => {
    // graphState continuation: the prompt asks for only the missing suffix of
    // combinedMaybePartialResults, so the reply is not standalone JSON
    const partial =
      '{"insights":[{"title":"Suspicious login","summaryMarkdown":"**sum**","detailsMarkdown":"**det**","alertIds":["a-1"]}';
    const suffixReply = ['```json', ']}', '```'].join('\n');
    const { inferenceClient, chatComplete } = createInferenceClient(suffixReply);

    const { insights } = await generateInsights({
      inferenceClient,
      log,
      prompt: 'Analyze the alerts.',
      alerts: ['alert one'],
      combinedMaybePartialResults: partial,
      continuePrompt: 'Continue the JSON array.',
    });

    expect(chatComplete).toHaveBeenCalledTimes(1);
    expect(insights).toEqual([
      {
        title: 'Suspicious login',
        summaryMarkdown: '**sum**',
        detailsMarkdown: '**det**',
        alertIds: ['a-1'],
      },
    ]);
  });

  it('renders $ sequences in the query literally, like the product prompt template', async () => {
    const { inferenceClient, chatComplete } = createInferenceClient(FENCED_JSON_REPLY);
    const alertsWithDollars = ['alert cmd: $& whoami; price 5$$'];

    await generateInsights({
      inferenceClient,
      log,
      prompt: 'Analyze the alerts.',
      alerts: alertsWithDollars,
    });

    const message = chatComplete.mock.calls[0]?.[0]?.messages[0];
    if (message == null) throw new Error('chatComplete was not called with a message');
    expect(message.content).toContain(alertsWithDollars[0]);
    expect(message.content).not.toContain('{query}');
  });
});

describe('runAttackDiscovery workflowApi mode', () => {
  const taskLog = { error: jest.fn() } as unknown as Parameters<
    typeof runAttackDiscovery
  >[0]['log'];

  const baseArgs = {
    inferenceClient: {} as BoundInferenceClient,
    attackDiscoveryClient: {} as Parameters<typeof runAttackDiscovery>[0]['attackDiscoveryClient'],
    log: taskLog,
  };

  it('forwards the input to the workflow client and returns run ids in raw', async () => {
    const generate = jest.fn(async () => ({
      discoveries: [{ title: 't', summaryMarkdown: 's', detailsMarkdown: 'd', alertIds: ['a'] }],
      executionUuid: 'exec-1',
      status: 'succeeded',
      workflowRuns: { alertRetrieval: ['r'], gate: ['g'], generation: 'gen', validation: 'v' },
      startedAt: '2026-01-01T00:00:00.000Z',
      latencyMs: 42,
    }));

    const output = await runAttackDiscovery({
      ...baseArgs,
      workflowApiClient: { generate } as unknown as AttackDiscoveryWorkflowApiClient,
      input: {
        mode: 'workflowApi',
        connectorId: 'c-1',
        size: 10,
        workflowConfig: { ground_truth_gate_enabled: true },
      },
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'c-1',
        size: 10,
        workflowConfig: { ground_truth_gate_enabled: true },
      })
    );
    expect(output.insights).toHaveLength(1);
    expect(output.errors).toBeUndefined();
    expect(output.raw).toEqual({
      execution_uuid: 'exec-1',
      status: 'succeeded',
      workflow_runs: { alertRetrieval: ['r'], gate: ['g'], generation: 'gen', validation: 'v' },
      started_at: '2026-01-01T00:00:00.000Z',
      latency_ms: 42,
    });
  });

  it('surfaces a client error with null insights', async () => {
    const generate = jest.fn(async () => ({
      discoveries: [],
      executionUuid: 'exec-1',
      status: 'failed',
      workflowRuns: { alertRetrieval: [], gate: [] },
      startedAt: '2026-01-01T00:00:00.000Z',
      latencyMs: 1,
      error: 'workflow run g failed',
    }));

    const output = await runAttackDiscovery({
      ...baseArgs,
      workflowApiClient: { generate } as unknown as AttackDiscoveryWorkflowApiClient,
      input: { mode: 'workflowApi', connectorId: 'c-1' },
    });

    expect(output.insights).toBeNull();
    expect(output.errors).toEqual(['workflow run g failed']);
  });

  it('errors when no workflow client is provided', async () => {
    const output = await runAttackDiscovery({
      ...baseArgs,
      input: { mode: 'workflowApi', connectorId: 'c-1' },
    });

    expect(output.insights).toBeNull();
    expect(output.errors?.[0]).toContain('workflowApiClient');
  });
});
