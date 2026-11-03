/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateInsights, runAttackDiscovery } from './run_attack_discovery';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { AttackDiscoveryTaskInput } from '../types';

const FENCED_JSON_REPLY = [
  'Here are the insights:',
  '```json',
  '{"insights":[{"title":"Suspicious login","summaryMarkdown":"**sum**","detailsMarkdown":"**det**","alertIds":["a-1"]}]}',
  '```',
].join('\n');

const log = { debug: jest.fn(), error: jest.fn() } as unknown as Parameters<
  typeof generateInsights
>[0]['log'];

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

  it('labels a wire failure and does not retry it as a parse failure', async () => {
    const chatComplete = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const inferenceClient = { chatComplete } as unknown as BoundInferenceClient;

    await expect(
      generateInsights({
        inferenceClient,
        log,
        prompt: 'Analyze the alerts.',
        alerts: ['alert one'],
      })
    ).rejects.toThrow(/inference request failed before a model response: fetch failed/);

    // one attempt: a request that never produced a response is not retried
    // through the parse loop, which allows three attempts
    expect(chatComplete).toHaveBeenCalledTimes(1);
  });

  it('records the wire failure in the task output errors', async () => {
    const chatComplete = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const inferenceClient = { chatComplete } as unknown as BoundInferenceClient;
    const attackDiscoveryClient = { searchAlertsAsContext: jest.fn() } as never;

    const output = await runAttackDiscovery({
      inferenceClient,
      attackDiscoveryClient,
      log,
      input: { mode: 'graphState', anonymizedAlerts: [] } as AttackDiscoveryTaskInput,
    });

    // the reporting shape (null insights + one error string) is the pre-existing
    // task-error path; this pins the message that path now carries
    expect(output.insights).toBeNull();
    expect(output.errors).toHaveLength(1);
    expect(output.errors?.[0]).toContain(
      'inference request failed before a model response: fetch failed'
    );
    expect(output.errors?.[0]).not.toContain('Failed to parse insights');
    expect(output.errorKind).toBe('infrastructure');
  });

  it('marks parse exhaustion as a model failure', async () => {
    const { inferenceClient, chatComplete } = createInferenceClient('');
    const attackDiscoveryClient = { searchAlertsAsContext: jest.fn() } as never;

    const output = await runAttackDiscovery({
      inferenceClient,
      attackDiscoveryClient,
      log,
      input: { mode: 'graphState', anonymizedAlerts: [] } as AttackDiscoveryTaskInput,
    });

    expect(chatComplete).toHaveBeenCalledTimes(3);
    expect(output.insights).toBeNull();
    expect(output.errors?.[0]).toContain('Failed to parse insights');
    expect(output.errorKind).toBe('model');
  });

  it('does not classify a message that merely resembles the wire-failure text as infrastructure', async () => {
    const chatComplete = jest.fn(async () => ({
      content: 'inference request failed before a model response',
    }));
    const inferenceClient = { chatComplete } as unknown as BoundInferenceClient;

    const output = await runAttackDiscovery({
      inferenceClient,
      attackDiscoveryClient: { searchAlertsAsContext: jest.fn() } as never,
      log,
      input: { mode: 'graphState', anonymizedAlerts: [] } as AttackDiscoveryTaskInput,
    });

    expect(output.errorKind).toBe('model');
  });

  it('marks a failed generateApi start as infrastructure and a failed generation as model', async () => {
    const run = (result: Record<string, unknown>) =>
      runAttackDiscovery({
        inferenceClient: {} as unknown as BoundInferenceClient,
        attackDiscoveryClient: {} as never,
        generateApiClient: {
          generate: jest.fn(async () => ({
            discoveries: [],
            executionUuid: '',
            status: 'failed',
            latencyMs: 1,
            ...result,
          })),
        } as never,
        log,
        input: { mode: 'generateApi', connectorId: 'c' } as AttackDiscoveryTaskInput,
      });

    const started = await run({
      error: 'generate HTTP 502: bad gateway',
      errorKind: 'infrastructure',
    });
    expect(started.errorKind).toBe('infrastructure');

    const generation = await run({
      executionUuid: 'u',
      error: 'generation failed: Maximum generation attempts (10) reached',
    });
    expect(generation.errorKind).toBe('model');

    const ok = await run({ status: 'succeeded' });
    expect(ok.errorKind).toBeUndefined();
  });
});
