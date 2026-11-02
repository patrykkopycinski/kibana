/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate as base } from '@kbn/evals';
import { AttackDiscoveryClient } from './clients/attack_discovery_client';
import { AttackDiscoveryGenerateApiClient } from './clients/attack_discovery_generate_api_client';
import { AttackDiscoveryWorkflowApiClient } from './clients/attack_discovery_workflow_api_client';
import type { EvaluateAttackDiscoveryDataset } from './evaluate_dataset';
import { createEvaluateAttackDiscoveryDataset } from './evaluate_dataset';

export const evaluate = base.extend<
  {},
  {
    attackDiscoveryClient: AttackDiscoveryClient;
    generateApiClient: AttackDiscoveryGenerateApiClient;
    workflowApiClient: AttackDiscoveryWorkflowApiClient;
    evaluateDataset: EvaluateAttackDiscoveryDataset;
  }
>({
  attackDiscoveryClient: [
    async ({ esClient, log }, use) => {
      await use(new AttackDiscoveryClient(esClient, log));
    },
    { scope: 'worker' },
  ],
  generateApiClient: [
    async ({ fetch, log }, use) => {
      await use(new AttackDiscoveryGenerateApiClient(fetch, log));
    },
    { scope: 'worker' },
  ],
  workflowApiClient: [
    async ({ fetch, log }, use) => {
      await use(new AttackDiscoveryWorkflowApiClient(fetch, log));
    },
    { scope: 'worker' },
  ],
  evaluateDataset: [
    (
      {
        attackDiscoveryClient,
        generateApiClient,
        workflowApiClient,
        executorClient,
        inferenceClient,
        evaluators,
        evaluationConnector,
        esClient,
        log,
      },
      use
    ) => {
      use(
        createEvaluateAttackDiscoveryDataset({
          evaluators,
          attackDiscoveryClient,
          generateApiClient,
          workflowApiClient,
          executorClient,
          inferenceClient,
          evaluationConnectorId: evaluationConnector.id,
          esClient,
          log,
        })
      );
    },
    { scope: 'worker' },
  ],
});
