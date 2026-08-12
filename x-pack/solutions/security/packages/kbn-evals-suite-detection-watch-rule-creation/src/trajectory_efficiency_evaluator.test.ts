/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTrajectoryEfficiencyEvaluator } from './evaluate_dataset';

const evaluator = createTrajectoryEfficiencyEvaluator();

const run = (toolCallIds: string[], toolCallsUnavailable = false) =>
  // The evaluator only reads `output`; the rest of the eval payload is irrelevant here.
  (
    evaluator.evaluate as (args: unknown) => Promise<{
      score: number | null;
      label: string;
      explanation: string;
      metadata?: Record<string, unknown>;
    }>
  )({
    output: { toolCallIds, toolCallsUnavailable, failedToolCallIds: [] },
  });

describe('createTrajectoryEfficiencyEvaluator', () => {
  it('scores a direct trajectory 1', async () => {
    const result = await run(['load_skill', 'security.create_detection_rule']);

    expect(result.score).toBe(1);
    expect(result.label).toBe('direct');
  });

  it('excludes load_skill from scoring as framework preamble', async () => {
    const result = await run(['load_skill', 'load_skill', 'security.create_detection_rule']);

    // Repeated load_skill must not count as thrashing — the agent did not choose it.
    expect(result.score).toBe(1);
    expect(result.label).toBe('direct');
    expect(result.metadata?.totalCalls).toBe(1);
  });

  /**
   * The case that motivates this evaluator. Both of these conversations were observed on the
   * golden cluster and BOTH score 1.0 under `Tool Routing`, because it only asks whether the
   * rule-creation tool eventually succeeded.
   */
  it('separates a thrashing trajectory from a clean one that Tool Routing scores identically', async () => {
    const clean = await run(['load_skill', 'security.create_detection_rule']);
    const thrashing = await run([
      'load_skill',
      'platform.core.list_indices',
      'platform.core.list_indices',
      'platform.core.list_indices',
      'platform.core.list_indices',
      'platform.core.list_indices',
      'security.create_detection_rule',
      'security.create_detection_rule',
    ]);

    expect(clean.score).toBe(1);
    expect(thrashing.score).toBeLessThan(1);
    expect(thrashing.label).toBe('thrashing');
    // 5x list_indices + 2x create = 7 calls, 5 of them redundant.
    expect(thrashing.metadata?.redundantCalls).toBe(5);
    expect(thrashing.explanation).toContain('platform.core.list_indicesx5');
  });

  it('does not penalise a long trajectory of distinct tools', async () => {
    const result = await run([
      'load_skill',
      'platform.core.list_indices',
      'platform.core.get_index_mapping',
      'relevance_search',
      'security.create_detection_rule',
    ]);

    // Length alone is not waste — four different tools each did distinct work.
    expect(result.score).toBe(1);
    expect(result.label).toBe('direct');
  });

  it('returns N/A rather than 0 when traces are unavailable', async () => {
    const result = await run([], true);

    // A false 0 would be indistinguishable from a genuinely terrible trajectory.
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('returns N/A when no agent-chosen tools were called', async () => {
    const result = await run(['load_skill']);

    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });
});
