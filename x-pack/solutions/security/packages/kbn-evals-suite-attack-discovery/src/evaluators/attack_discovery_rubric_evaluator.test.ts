/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscoveryTaskOutput } from '../types';
import { createAttackDiscoveryRubricEvaluator } from './attack_discovery_rubric_evaluator';

const evaluate = (output: AttackDiscoveryTaskOutput) =>
  createAttackDiscoveryRubricEvaluator({
    inferenceClient: {} as unknown as BoundInferenceClient,
    log: {} as unknown as ToolingLog,
  }).evaluate({
    input: {},
    output,
    expected: { attackDiscoveries: [] },
    metadata: {},
  } as never);

describe('AttackDiscoveryRubric task errors', () => {
  it('scores an infrastructure failure as N/A (null), not 0', async () => {
    const result = await evaluate({
      insights: null,
      errors: ['Attack Discovery inference request failed before a model response: fetch failed'],
      errorKind: 'infrastructure',
    });

    expect(result.score).toBeNull();
    expect(result.label).toBe('task_error');
  });

  it('keeps parse exhaustion (a model failure) at 0', async () => {
    const result = await evaluate({
      insights: null,
      errors: ['Failed to parse insights from the LLM response after 3 attempts: boom'],
      errorKind: 'model',
    });

    expect(result.score).toBe(0);
    expect(result.label).toBe('task_error');
  });

  it('keeps a task error without an errorKind at 0', async () => {
    const result = await evaluate({ insights: null, errors: ['boom'] });

    expect(result.score).toBe(0);
    expect(result.label).toBe('task_error');
  });

  it('keeps missing insights without errors at 0', async () => {
    const result = await evaluate({ insights: null });

    expect(result.score).toBe(0);
    expect(result.label).toBe('missing_insights');
  });
});
