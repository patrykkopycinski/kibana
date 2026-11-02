/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput } from '../types';
import {
  ATTACK_DISCOVERY_TOKEN_PHASES,
  computePhaseTokenUsage,
  createAttackDiscoveryTokenUsageEvaluators,
  type TokenUsageDoc,
} from './attack_discovery_token_usage_evaluator';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

const doc = ({
  atSec,
  prompt,
  cached,
  completion = 10,
  featureId,
  parentFeatureId,
}: {
  atSec: number;
  prompt: number;
  cached?: number;
  completion?: number;
  featureId?: string;
  parentFeatureId?: string;
}): TokenUsageDoc => ({
  '@timestamp': new Date(T0 + atSec * 1000).toISOString(),
  token_usage: {
    prompt_tokens: prompt,
    completion_tokens: completion,
    ...(cached !== undefined ? { cached_tokens: cached } : {}),
  },
  inference: {
    connector_id: 'c-1',
    ...(featureId ? { feature_id: featureId } : {}),
    ...(parentFeatureId ? { parent_feature_id: parentFeatureId } : {}),
  },
});

const ZERO = {
  inputTokens: 0,
  cachedTokens: 0,
  uncachedTokens: 0,
  outputTokens: 0,
  calls: 0,
  peak60sInputTokens: 0,
  maxCallInputTokens: 0,
};

describe('computePhaseTokenUsage', () => {
  it('returns zeros for every phase when there are no docs', () => {
    const usage = computePhaseTokenUsage([]);

    expect(Object.keys(usage).sort()).toEqual([...ATTACK_DISCOVERY_TOKEN_PHASES].sort());
    for (const phase of ATTACK_DISCOVERY_TOKEN_PHASES) {
      expect(usage[phase]).toEqual(ZERO);
    }
  });

  it('buckets by feature id into gate, report, generation and untagged', () => {
    const usage = computePhaseTokenUsage([
      doc({
        atSec: 0,
        prompt: 100,
        featureId: 'attack_discovery_gate',
        parentFeatureId: 'attack_discovery',
      }),
      doc({
        atSec: 1,
        prompt: 200,
        featureId: 'attack_discovery_report',
        parentFeatureId: 'attack_discovery',
      }),
      doc({
        atSec: 2,
        prompt: 300,
        featureId: 'attack_discovery_generation',
        parentFeatureId: 'attack_discovery',
      }),
      doc({ atSec: 3, prompt: 400 }),
      doc({ atSec: 4, prompt: 50, featureId: 'something_else' }),
    ]);

    expect(usage.gate.inputTokens).toBe(100);
    expect(usage.report.inputTokens).toBe(200);
    expect(usage.generation.inputTokens).toBe(300);
    expect(usage.untagged.inputTokens).toBe(450);
    expect(usage.untagged.calls).toBe(2);
  });

  it('treats cached tokens as a subset of input and derives uncached', () => {
    const usage = computePhaseTokenUsage([
      doc({
        atSec: 0,
        prompt: 1000,
        cached: 600,
        completion: 40,
        featureId: 'attack_discovery_gate',
      }),
      doc({ atSec: 5, prompt: 500, completion: 10, featureId: 'attack_discovery_gate' }),
    ]);

    expect(usage.gate).toEqual({
      inputTokens: 1500,
      cachedTokens: 600,
      uncachedTokens: 900,
      outputTokens: 50,
      calls: 2,
      peak60sInputTokens: 1500,
      maxCallInputTokens: 1000,
    });
  });

  it('computes the peak input over any sliding 60s window', () => {
    const gate = 'attack_discovery_gate';
    const usage = computePhaseTokenUsage([
      doc({ atSec: 0, prompt: 100, featureId: gate }),
      doc({ atSec: 30, prompt: 100, featureId: gate }),
      doc({ atSec: 59, prompt: 100, featureId: gate }),
      // exactly 60s after the first call: the first call has left the window
      doc({ atSec: 60, prompt: 100, featureId: gate }),
      doc({ atSec: 200, prompt: 250, featureId: gate }),
    ]);

    expect(usage.gate.peak60sInputTokens).toBe(300);
    expect(usage.gate.inputTokens).toBe(650);
  });

  it('is independent of document order', () => {
    const gate = 'attack_discovery_gate';
    const usage = computePhaseTokenUsage([
      doc({ atSec: 50, prompt: 10, featureId: gate }),
      doc({ atSec: 0, prompt: 10, featureId: gate }),
      doc({ atSec: 100, prompt: 10, featureId: gate }),
    ]);

    expect(usage.gate.peak60sInputTokens).toBe(20);
  });
});

describe('createAttackDiscoveryTokenUsageEvaluators', () => {
  const log = { warning: jest.fn(), debug: jest.fn() } as unknown as ToolingLog;

  const workflowOutput = (): AttackDiscoveryTaskOutput => ({
    insights: null,
    raw: {
      started_at: '2026-01-01T00:00:00.000Z',
      latency_ms: 1000,
      workflow_runs: {},
    },
  });

  const example = {
    input: { mode: 'workflowApi', connectorId: 'c-1' },
    output: { attackDiscoveries: [] },
    metadata: {},
  } as unknown as AttackDiscoveryDatasetExample;

  const createEs = (docs: TokenUsageDoc[] | Error) => {
    const search = jest.fn(async () => {
      if (docs instanceof Error) throw docs;
      return { hits: { hits: docs.map((_source) => ({ _source })) } };
    });
    return { esClient: { search } as unknown as EsClient, search };
  };

  const run = async (
    evaluators: ReturnType<typeof createAttackDiscoveryTokenUsageEvaluators>,
    output: AttackDiscoveryTaskOutput
  ) =>
    Promise.all(
      evaluators.map(async (evaluator) => ({
        name: evaluator.name,
        direction: evaluator.direction,
        result: await evaluator.evaluate({
          input: example.input,
          output,
          expected: example.output,
          metadata: example.metadata,
        }),
      }))
    );

  it('emits one neutral informational evaluator per phase, with the breakdown in metadata', async () => {
    const { esClient } = createEs([
      doc({
        atSec: 1,
        prompt: 800,
        cached: 300,
        completion: 20,
        featureId: 'attack_discovery_gate',
        parentFeatureId: 'attack_discovery',
      }),
    ]);

    const results = await run(
      createAttackDiscoveryTokenUsageEvaluators({ esClient, log }),
      workflowOutput()
    );

    expect(results.map((r) => r.name)).toEqual([
      'AttackDiscoveryTokens:gate',
      'AttackDiscoveryTokens:report',
      'AttackDiscoveryTokens:generation',
      'AttackDiscoveryTokens:untagged',
    ]);
    expect(results.every((r) => r.direction === 'neutral')).toBe(true);

    const gate = results[0].result;
    expect(gate.score).toBe(800);
    expect(gate.metadata).toEqual({
      phase: 'gate',
      inputTokens: 800,
      cachedTokens: 300,
      uncachedTokens: 500,
      outputTokens: 20,
      calls: 1,
      peak60sInputTokens: 800,
      maxCallInputTokens: 800,
    });
    expect(results[1].result.score).toBe(0);
  });

  it('queries the token usage index once per run, bounded by the run window and connector', async () => {
    const { esClient, search } = createEs([]);
    const output = workflowOutput();

    await run(createAttackDiscoveryTokenUsageEvaluators({ esClient, log }), output);

    expect(search).toHaveBeenCalledTimes(1);
    const request = JSON.stringify((search.mock.calls as unknown[][])[0][0]);
    expect(request).toContain('.kibana-inference-token-usage');
    expect(request).toContain('2026-01-01T00:00:00.000Z');
    expect(request).toContain('inference.connector_id');
    expect(request).toContain('c-1');
  });

  it('reports zeros, not an error, when the index is empty', async () => {
    const { esClient } = createEs([]);

    const results = await run(
      createAttackDiscoveryTokenUsageEvaluators({ esClient, log }),
      workflowOutput()
    );

    for (const { result } of results) {
      expect(result.score).toBe(0);
      expect(result.label).toBe('no_usage');
    }
  });

  it('reports zeros when the token usage index does not exist yet', async () => {
    const missing = Object.assign(new Error('index_not_found_exception'), {
      meta: { statusCode: 404 },
    });
    const { esClient } = createEs(missing);

    const results = await run(
      createAttackDiscoveryTokenUsageEvaluators({ esClient, log }),
      workflowOutput()
    );

    for (const { result } of results) {
      expect(result.score).toBe(0);
      expect(result.label).toBe('no_usage');
    }
  });

  it('does not throw and reports unavailable on other search errors', async () => {
    const { esClient } = createEs(new Error('boom'));

    const results = await run(
      createAttackDiscoveryTokenUsageEvaluators({ esClient, log }),
      workflowOutput()
    );

    for (const { result } of results) {
      expect(result.score).toBeNull();
      expect(result.label).toBe('unavailable');
      expect(result.explanation).toContain('boom');
    }
  });

  it('is not applicable, and does not query, for outputs without a workflow run window', async () => {
    const { esClient, search } = createEs([]);

    const results = await run(createAttackDiscoveryTokenUsageEvaluators({ esClient, log }), {
      insights: null,
      raw: { execution_uuid: 'x' },
    });

    expect(search).not.toHaveBeenCalled();
    for (const { result } of results) {
      expect(result.score).toBeNull();
      expect(result.label).toBe('not_applicable');
    }
  });
});
