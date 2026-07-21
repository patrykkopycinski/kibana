/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tokenUsage } from './evaluators';
import type { AlertAnalysisVerdict } from './workflow_task';

interface EvaluatorResult {
  score: number;
  label: string;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

const run = (output: AlertAnalysisVerdict): Promise<EvaluatorResult> =>
  // The evaluator only reads `output`; the rest of the eval args are unused here.
  (tokenUsage.evaluate as (args: { output: unknown }) => Promise<EvaluatorResult>)({ output });

describe('tokenUsage evaluator', () => {
  it('scores 1 and reports token/latency metadata when usage was captured', async () => {
    const result = await run({
      executionStatus: 'completed',
      usage: { inputTokens: 100, outputTokens: 40, cachedTokens: 10, totalTokens: 140 },
      latencyMs: 5200,
      agentLatencyMs: 4200,
    } as AlertAnalysisVerdict);

    expect(result.score).toBe(1);
    expect(result.label).toBe('captured');
    expect(result.metadata).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      cachedTokens: 10,
      totalTokens: 140,
      latencyMs: 5200,
      agentLatencyMs: 4200,
    });
  });

  it('scores 0 with label no-usage when the execution reported no usage', async () => {
    const result = await run({ executionStatus: 'completed' } as AlertAnalysisVerdict);

    expect(result.score).toBe(0);
    expect(result.label).toBe('no-usage');
    expect(result.metadata).toMatchObject({
      inputTokens: null,
      totalTokens: null,
      latencyMs: null,
    });
  });
});
