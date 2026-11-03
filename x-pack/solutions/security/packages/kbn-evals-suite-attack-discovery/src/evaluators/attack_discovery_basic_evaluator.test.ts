/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackDiscoveryTaskOutput } from '../types';
import { createAttackDiscoveryBasicEvaluator } from './attack_discovery_basic_evaluator';

type BasicEvaluator = ReturnType<typeof createAttackDiscoveryBasicEvaluator>;
type EvaluateParams = Parameters<BasicEvaluator['evaluate']>[0];

const evaluate = (output: AttackDiscoveryTaskOutput) => {
  const params: EvaluateParams = {
    input: { mode: 'bundledAlerts', anonymizedAlerts: [] },
    output,
    expected: { attackDiscoveries: [] },
    metadata: {},
  };
  return createAttackDiscoveryBasicEvaluator().evaluate(params);
};

const validInsight = {
  title: 'Suspicious login',
  summaryMarkdown: 'sum',
  detailsMarkdown: 'det',
  alertIds: ['a-1'],
  entitySummaryMarkdown: '',
  mitreAttackTactics: [],
  timestamp: '2026-01-01T00:00:00.000Z',
};

describe('AttackDiscoveryBasic', () => {
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
      errors: [
        'Failed to parse insights from the LLM response after 3 attempts: SyntaxError: Unexpected end of JSON input',
      ],
      errorKind: 'model',
    });

    expect(result.score).toBe(0);
    expect(result.label).toBe('missing_insights');
  });

  it('keeps missing insights without an errorKind at 0', async () => {
    expect((await evaluate({ insights: null, errors: ['boom'] })).score).toBe(0);
    expect((await evaluate({ insights: null })).score).toBe(0);
  });

  it('keeps invalid shapes at 0 and valid insights at 1', async () => {
    expect((await evaluate({ insights: [{ ...validInsight, title: '' }] as never })).score).toBe(0);
    expect((await evaluate({ insights: [validInsight] as never })).score).toBe(1);
  });
});
