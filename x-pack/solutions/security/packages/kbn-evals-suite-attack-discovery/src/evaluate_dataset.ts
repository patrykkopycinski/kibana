/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient } from '@kbn/inference-common';
import type {
  DefaultEvaluators,
  EvalsExecutorClient,
  EvaluationDataset,
  Evaluator,
  TaskOutput,
} from '@kbn/evals';
import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscoveryClient } from './clients/attack_discovery_client';
import type { AttackDiscoveryGenerateApiClient } from './clients/attack_discovery_generate_api_client';
import type { AttackDiscoveryWorkflowApiClient } from './clients/attack_discovery_workflow_api_client';
import type { AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput } from './types';
import { runAttackDiscovery } from './task/run_attack_discovery';
import { createAttackDiscoveryBasicEvaluator } from './evaluators/attack_discovery_basic_evaluator';
import { createAttackDiscoveryRubricEvaluator } from './evaluators/attack_discovery_rubric_evaluator';
import { createAttackDiscoveryTokenUsageEvaluators } from './evaluators/attack_discovery_token_usage_evaluator';
import { createAttackDiscoveryCriteriaEvaluator } from './evaluators/attack_discovery_criteria_evaluator';

const resolveConcurrency = (): number | undefined => {
  const raw = process.env.ATTACK_DISCOVERY_EVAL_CONCURRENCY;
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.floor(parsed));
};

export type EvaluateAttackDiscoveryDataset = (options: {
  dataset: {
    name: string;
    description: string;
    examples: AttackDiscoveryDatasetExample[];
  };
  trustUpstreamDataset?: boolean;
}) => Promise<void>;

const configureExperiment = ({
  evaluators,
  attackDiscoveryClient,
  generateApiClient,
  workflowApiClient,
  inferenceClient,
  evaluationInferenceClient,
  esClient,
  includeTokenUsage,
  log,
}: {
  evaluators: DefaultEvaluators;
  attackDiscoveryClient: AttackDiscoveryClient;
  generateApiClient: AttackDiscoveryGenerateApiClient;
  workflowApiClient: AttackDiscoveryWorkflowApiClient;
  inferenceClient: BoundInferenceClient;
  evaluationInferenceClient: BoundInferenceClient;
  esClient: EsClient;
  /** Per-phase token rows only make sense for workflow runs; other modes get no extra rows. */
  includeTokenUsage: boolean;
  log: ToolingLog;
}): {
  task: (params: {
    input: AttackDiscoveryDatasetExample['input'];
  }) => Promise<AttackDiscoveryTaskOutput>;
  evaluators: Array<Evaluator<AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput>>;
} => {
  const { inputTokens, outputTokens, cachedTokens, toolCalls, latency } =
    evaluators.traceBasedEvaluators;

  return {
    task: async ({ input }) => {
      if (!input) {
        return { insights: null, errors: ['Missing input'] };
      }

      return runAttackDiscovery({
        inferenceClient,
        attackDiscoveryClient,
        generateApiClient,
        workflowApiClient,
        input,
        log,
      });
    },
    evaluators: [
      createAttackDiscoveryBasicEvaluator(),
      createAttackDiscoveryCriteriaEvaluator({ evaluators }),
      createAttackDiscoveryRubricEvaluator({ inferenceClient: evaluationInferenceClient, log }),
      toolCalls as Evaluator<AttackDiscoveryDatasetExample, TaskOutput>,
      latency as Evaluator<AttackDiscoveryDatasetExample, TaskOutput>,
      inputTokens as Evaluator<AttackDiscoveryDatasetExample, TaskOutput>,
      outputTokens as Evaluator<AttackDiscoveryDatasetExample, TaskOutput>,
      cachedTokens as Evaluator<AttackDiscoveryDatasetExample, TaskOutput>,
      ...(includeTokenUsage ? createAttackDiscoveryTokenUsageEvaluators({ esClient, log }) : []),
    ],
  };
};

export const createEvaluateAttackDiscoveryDataset = ({
  evaluators,
  attackDiscoveryClient,
  generateApiClient,
  workflowApiClient,
  executorClient,
  inferenceClient,
  evaluationConnectorId,
  esClient,
  log,
}: {
  evaluators: DefaultEvaluators;
  attackDiscoveryClient: AttackDiscoveryClient;
  generateApiClient: AttackDiscoveryGenerateApiClient;
  workflowApiClient: AttackDiscoveryWorkflowApiClient;
  executorClient: EvalsExecutorClient;
  inferenceClient: BoundInferenceClient;
  evaluationConnectorId: string;
  esClient: EsClient;
  log: ToolingLog;
}): EvaluateAttackDiscoveryDataset => {
  const evaluateAttackDiscoveryDataset: EvaluateAttackDiscoveryDataset = async ({
    dataset: { name, description, examples },
    trustUpstreamDataset = false,
  }) => {
    const dataset = {
      name,
      description,
      examples,
    } satisfies EvaluationDataset<AttackDiscoveryDatasetExample>;

    const evaluationInferenceClient = inferenceClient.bindTo({
      connectorId: evaluationConnectorId,
    });

    const { task, evaluators: experimentEvaluators } = configureExperiment({
      evaluators,
      attackDiscoveryClient,
      generateApiClient,
      workflowApiClient,
      inferenceClient,
      evaluationInferenceClient,
      esClient,
      includeTokenUsage: examples.some(({ input }) => input?.mode === 'workflowApi'),
      log,
    });

    await executorClient.runExperiment(
      {
        datasets: [dataset],
        task: async ({ input }) => task({ input }),
        concurrency: resolveConcurrency(),
        trustUpstreamDataset,
      },
      experimentEvaluators
    );
  };

  return evaluateAttackDiscoveryDataset;
};
