/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators } from '@kbn/evals';
import type { AttackDiscoveryTaskOutput } from '../types';
import { createAttackDiscoveryCriteriaEvaluator } from './attack_discovery_criteria_evaluator';

const run = (output: AttackDiscoveryTaskOutput) => {
  const judge = jest.fn(async () => ({ score: 0, label: 'FAIL' }));
  const evaluators = {
    criteria: jest.fn(() => ({ evaluate: judge })),
  } as unknown as DefaultEvaluators;
  const result = createAttackDiscoveryCriteriaEvaluator({ evaluators }).evaluate({
    input: {},
    output,
    expected: { attackDiscoveries: [], criteria: ['finds the attack'] },
    metadata: {},
  } as never);
  return { result, judge };
};

describe('AttackDiscoveryCriteria task errors', () => {
  it('skips the judge and returns N/A (null) for an infrastructure failure', async () => {
    const { result, judge } = run({
      insights: null,
      errors: ['request failed'],
      errorKind: 'infrastructure',
    });

    expect(await result).toMatchObject({ score: null, label: 'task_error' });
    expect(judge).not.toHaveBeenCalled();
  });

  it('still sends a model failure to the judge', async () => {
    const { result, judge } = run({ insights: null, errors: ['bad'], errorKind: 'model' });

    expect((await result).score).toBe(0);
    expect(judge).toHaveBeenCalledTimes(1);
  });
});
