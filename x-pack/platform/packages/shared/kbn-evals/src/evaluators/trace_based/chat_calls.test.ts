/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createChatCallsEvaluator } from './chat_calls';

const VALID_TRACE_ID = '0af7651916cd43dd8448eb211c80319c';

describe('createChatCallsEvaluator', () => {
  let mockEsClient: jest.Mocked<EsClient>;
  let mockLog: jest.Mocked<ToolingLog>;

  const evaluate = (output: unknown) =>
    createChatCallsEvaluator({ traceEsClient: mockEsClient, log: mockLog }).evaluate({
      input: {},
      output,
      expected: {},
      metadata: {},
    } as any);

  beforeEach(() => {
    jest.useFakeTimers();
    mockEsClient = { esql: { query: jest.fn() } } as any;
    mockLog = {
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts the chat spans in the trace', async () => {
    (mockEsClient.esql.query as jest.Mock).mockResolvedValue({
      columns: [{ name: 'chat_calls', type: 'long' }],
      values: [[6]],
    });

    await expect(evaluate({ traceId: VALID_TRACE_ID })).resolves.toMatchObject({ score: 6 });
  });

  it('filters to chat operation spans for the requested trace', async () => {
    (mockEsClient.esql.query as jest.Mock).mockResolvedValue({
      columns: [{ name: 'chat_calls', type: 'long' }],
      values: [[1]],
    });

    await evaluate({ traceId: VALID_TRACE_ID });

    const { query } = (mockEsClient.esql.query as jest.Mock).mock.calls[0][0];
    expect(query).toContain(`trace.id == "${VALID_TRACE_ID}"`);
    expect(query).toContain('attributes.gen_ai.operation.name == "chat"');
  });

  it('scores null when the task produced no traceId', async () => {
    const result = await evaluate({});

    expect(result.score).toBeNull();
    expect(result.label).toBe('unavailable');
    expect(mockEsClient.esql.query as jest.Mock).not.toHaveBeenCalled();
  });

  // A trace that has not finished exporting reports zero chat spans, which is
  // indistinguishable from a real result unless it is retried. Reporting 0 as a
  // score would average in as "this run made no LLM calls", which never happens
  // for a run that produced output.
  it('retries a zero count rather than reporting it as a real result', async () => {
    (mockEsClient.esql.query as jest.Mock).mockResolvedValue({
      columns: [{ name: 'chat_calls', type: 'long' }],
      values: [[0]],
    });

    const promise = evaluate({ traceId: VALID_TRACE_ID });
    await jest.advanceTimersByTimeAsync(300_000);
    const result = await promise;

    expect((mockEsClient.esql.query as jest.Mock).mock.calls.length).toBeGreaterThan(1);
    expect(result.label).toBe('potentially_incomplete');
  });
});
