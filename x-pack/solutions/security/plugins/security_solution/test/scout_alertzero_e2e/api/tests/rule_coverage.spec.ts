/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-security/api';
import type { EsClient } from '@kbn/scout-security';
import {
  apiTest,
  assertExecutionCompleted,
  tags,
  testData,
  approveProposal,
  cleanupKnowledgeIndicators,
  createServiceAccount,
  deleteServiceAccount,
  dismissProposal,
  getAdminApi,
  getWorker,
  listExecutionIds,
  listPendingProposals,
  ok,
  pollUntil,
  resetWorker,
  runWorkflow,
  seedKnowledgeIndicator,
  updateWorker,
  waitForExecution,
  waitForNewExecution,
} from '../fixtures';
import type { AlertZeroApi, WorkflowExecution } from '../fixtures';

const WORKER_ID = testData.RULE_COVERAGE_WORKER_ID;
const COVERAGE_REVIEW_WORKFLOW_ID = 'system-security-coverage-review';

let api: AlertZeroApi | undefined;
let esClientRef: EsClient | undefined;
let serviceAccountId: string | undefined;
let workerWorkflowId: string | undefined;
const kiIds: string[] = [];

/** Binds a service account, waits for the settings write to install the workflow, enables. */
const enableCoverageWorker = async (adminApi: AlertZeroApi): Promise<string> => {
  const account = await createServiceAccount(adminApi);
  serviceAccountId = account;
  const beforeSave = await getWorker(adminApi, WORKER_ID);
  await updateWorker(adminApi, WORKER_ID, {
    settingsRevision: beforeSave.settingsRevision ?? null,
    settings: { serviceAccountId: account },
  });
  const worker = await pollUntil(
    `worker ${WORKER_ID} to have a workflow installed`,
    async () => {
      const candidate = await getWorker(adminApi, WORKER_ID);
      return candidate.workflowId ? candidate : undefined;
    },
    { timeoutMs: testData.PROPOSAL_TIMEOUT_MS }
  );
  if (!worker.workflowId) {
    throw new Error(`Worker ${WORKER_ID} has no workflow installed`);
  }
  expect((await updateWorker(adminApi, WORKER_ID, { enabled: true })).enabled).toBe(true);
  return worker.workflowId;
};

apiTest.describe('AlertZero e2e - rule coverage', { tag: [...tags.stateful.classic] }, () => {
  apiTest.afterAll(async ({ apiClient, samlAuth }) => {
    const errors: unknown[] = [];
    const attempt = async (step: () => Promise<unknown>) => {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    };
    await attempt(async () => {
      api = await getAdminApi(apiClient, samlAuth);
    });
    await attempt(async () => {
      if (api) await resetWorker(api, WORKER_ID);
    });
    await attempt(async () => {
      if (api && serviceAccountId) await deleteServiceAccount(api, serviceAccountId);
    });
    await attempt(async () => {
      if (esClientRef) await cleanupKnowledgeIndicators(esClientRef, kiIds);
    });
    if (errors.length > 0) {
      throw new Error(
        `AlertZero e2e cleanup failed: ${errors
          .map((error) => (error instanceof Error ? error.message : String(error)))
          .join('; ')}`
      );
    }
  });

  apiTest(
    'reviews a seeded coverage gap and proposes a fix',
    async ({ apiClient, samlAuth, esClient }) => {
      apiTest.setTimeout(testData.GENERATION_TIMEOUT_MS + 2 * testData.PROPOSAL_TIMEOUT_MS);
      const adminApi = await getAdminApi(apiClient, samlAuth);
      api = adminApi;
      esClientRef = esClient;
      const startedAt = new Date().toISOString();

      workerWorkflowId = await enableCoverageWorker(adminApi);
      const knownExecutionIds = [
        ...(await listExecutionIds(adminApi, workerWorkflowId)),
        ...(await listExecutionIds(adminApi, COVERAGE_REVIEW_WORKFLOW_ID)),
      ];

      // A gap KI in the shape Hunt packaging writes: pending, in this space, with a technique.
      const kiId = await seedKnowledgeIndicator(esClient, {
        kiId: `e2e-coverage-${Date.now().toString(36)}`,
        type: 'security.coverage',
        title: 'No rule covers credentials from LSASS memory dumping',
        description:
          'E2e seeded gap: adversary dumps LSASS memory for credential access; no enabled rule covers the technique.',
        attributes: {
          technique: 'T1003.001',
          report_id: 'e2e-report',
          has_confirmed_hit: false,
        },
      });
      kiIds.push(kiId);

      // The enabled worker's immediate scheduled run is the sweep under test.
      const sweepExecutionId = await waitForNewExecution(
        adminApi,
        workerWorkflowId,
        knownExecutionIds.filter((id) => id),
        { timeoutMs: testData.ACTION_TIMEOUT_MS }
      );
      const sweep = await waitForExecution(
        adminApi,
        'the coverage sweep execution to finish',
        sweepExecutionId,
        { timeoutMs: testData.GENERATION_TIMEOUT_MS }
      );
      await assertExecutionCompleted(adminApi, 'The coverage sweep execution', sweep);

      // The sweep starts one review per pending indicator. Manual autonomy gates the coverage
      // check behind an analyst approval on the review's investigation.
      const reviewExecutionId = await pollUntil(
        `an execution of ${COVERAGE_REVIEW_WORKFLOW_ID} started after the sweep`,
        async () =>
          (
            await listExecutionIds(adminApi, COVERAGE_REVIEW_WORKFLOW_ID)
          ).find((id) => !knownExecutionIds.includes(id)),
        { timeoutMs: testData.ACTION_TIMEOUT_MS }
      );
      await waitForExecution(
        adminApi,
        'the coverage review execution to reach its gate',
        reviewExecutionId,
        // The review parks on its approval gate for up to 176h, so "terminal" here means the
        // review has settled; the proposal polling below is what actually paces this test.
        { timeoutMs: testData.PROPOSAL_TIMEOUT_MS }
      ).catch((error: unknown): WorkflowExecution | undefined => {
        // A parked review times out this wait without failing: the gate proposal is the signal.
        void error;
        return undefined;
      });

      const entryProposal = await pollUntil(
        'the coverage review-gate proposal',
        async () =>
          (
            await listPendingProposals(adminApi)
          ).find(
            (proposal) =>
              proposal.createdAt >= startedAt && proposal.comment.toLowerCase().includes('coverage')
          ),
        { timeoutMs: testData.PROPOSAL_TIMEOUT_MS }
      );
      await approveProposal(adminApi, entryProposal);

      // After approval the coverage skill runs (real model call) and proposes the cheapest fix
      // on the same investigation: enable a disabled rule, install a prebuilt one, or a
      // confirmation that an enabled rule already covers the gap.
      const fixProposal = await pollUntil(
        'a coverage fix proposal',
        async () =>
          (
            await listPendingProposals(adminApi)
          ).find(
            (proposal) =>
              proposal.createdAt >= startedAt &&
              (proposal.actionWorkflowId === testData.ENABLE_RULE_ACTION_ID ||
                proposal.actionWorkflowId === testData.INSTALL_PREBUILT_RULE_ACTION_ID ||
                proposal.actionWorkflowId === testData.ADD_RULE_EXCEPTION_ACTION_ID ||
                proposal.actionInput === undefined) &&
              proposal.id !== entryProposal.id &&
              proposal.conversationId === entryProposal.conversationId
          ),
        { timeoutMs: testData.GENERATION_TIMEOUT_MS }
      );
      expect(fixProposal.conversationId).toBe(entryProposal.conversationId);

      // Settle the gate without side effects: dismissing records a decision and closes the
      // review, so nothing is left pending against a stack later runs reuse.
      await dismissProposal(adminApi, fixProposal);
    }
  );

  // Known gap, expected to fail until security-team#19988 (fix PR elastic/kibana#296929) lands:
  // a sweep whose AI index does not exist must complete reporting zero pending indicators, not
  // error. Runs the sweep by hand against an absent index; no model is involved either way.
  apiTest.fail(
    'treats an absent AI index as empty, not as an error (security-team#19988)',
    async () => {
      const adminApi = api;
      if (!adminApi || !workerWorkflowId) {
        throw new Error('the green coverage test must run first to install the worker workflow');
      }
      const sweep = await runWorkflow(
        adminApi,
        workerWorkflowId,
        { ai_index_id: 'alertzero-e2e-absent', batch_size: 1, lookback_days: 1 },
        { timeoutMs: testData.ACTION_TIMEOUT_MS }
      );
      expect(sweep.status).toBe('completed');
      const withOutput = ok(
        await adminApi.public<{ output?: { search_failed?: unknown } }>(
          'GET',
          `/api/workflows/executions/${encodeURIComponent(sweep.id)}?includeOutput=true`
        ),
        'read the sweep output'
      );
      expect(withOutput.output?.search_failed).toBe(false);
    }
  );
});
