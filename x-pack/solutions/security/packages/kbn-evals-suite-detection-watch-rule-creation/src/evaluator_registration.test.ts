/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators } from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import * as evaluatorModule from './evaluate_dataset';
import { createEvaluateDataset } from './evaluate_dataset';
import type { RuleCreationClient } from './rule_creation_client';

/**
 * An evaluator that is authored, exported and unit-tested but never added to `allEvaluators` is
 * dead code that looks like coverage. Nothing else in the suite catches it: the unit tests pass,
 * the eval run is green, and the metric simply never appears in the report — which reads as
 * "not measured", exactly like a harness failure, only quieter.
 *
 * This asserts the registration by running `createEvaluateDataset` against a stub executor and
 * capturing the evaluator list it actually passes to `runExperiment`, rather than by reading the
 * source. That way it tracks real behaviour and cannot be fooled by a factory that is referenced
 * in the file but never reached.
 */
const captureRegisteredEvaluators = async (): Promise<string[]> => {
  let captured: Array<{ name: string }> = [];

  const executorClient = {
    runExperiment: async (_experiment: unknown, evaluators: Array<{ name: string }>) => {
      captured = evaluators;
    },
  };

  await createEvaluateDataset({
    ruleCreationClient: { run: async () => ({}) } as unknown as RuleCreationClient,
    evaluators: {} as DefaultEvaluators,
    executorClient: executorClient as never,
    log: { info: () => {}, debug: () => {}, warning: () => {} } as unknown as ToolingLog,
  })({ dataset: { name: 'stub', description: 'stub', examples: [] } as never });

  return captured.map((e) => e.name);
};

describe('evaluator registration', () => {
  it('registers every exported evaluator factory', async () => {
    const exportedFactories = Object.keys(evaluatorModule).filter((k) =>
      /^create.+Evaluator$/.test(k)
    );
    const registered = await captureRegisteredEvaluators();

    // Every factory should contribute exactly one registered evaluator.
    expect(registered).toHaveLength(exportedFactories.length);
  });

  it('registers the safety-critical evaluators by name', async () => {
    // Pinned explicitly: losing the approval gate must not be a silent one-line diff.
    const registered = await captureRegisteredEvaluators();

    expect(registered).toContain('Approval Gate Held');
    expect(registered).toContain('Tool Routing');
  });
});
