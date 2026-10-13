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
  createServiceAccount,
  deleteServiceAccount,
  getAdminApi,
  getWorker,
  listExecutionIds,
  listPendingProposals,
  ok,
  pollUntil,
  resetWorker,
  updateWorker,
  waitForExecution,
  waitForNewExecution,
} from '../fixtures';
import type { AlertZeroApi, PendingProposal } from '../fixtures';

const WORKER_ID = testData.RULE_TUNING_WORKER_ID;
const TUNING_REVIEW_WORKFLOW_ID = 'system-security-rule-tuning-review';

// The FP pattern the tuning must scope to: one service account hammering one file server.
const FP_HOST = 'srv-files-02';
const FP_USER = 'svc-backup';
const TP_USER = 'matt.hart';
// 12 closed-FP of 21 total = 57.142...% — a rate whose unrounded rendering differs from the
// rounded one, which is what the fp_rate known-fail marker below asserts on.
const FP_COUNT = 12;
const OPEN_COUNT = 9;

interface SeededRule {
  readonly ruleId: string;
  readonly revision: number;
  readonly runMarker: string;
  readonly alertIds: readonly string[];
}

let api: AlertZeroApi | undefined;
let esClientRef: EsClient | undefined;
let serviceAccountId: string | undefined;
let seededRule: SeededRule | undefined;
let entryProposal: PendingProposal | undefined;

/** Creates the noisy rule the sweep should pick, then indexes its FP and TP alerts. */
const seedNoisyRule = async (adminApi: AlertZeroApi, esClient: EsClient): Promise<SeededRule> => {
  const runMarker = `alertzero-e2e-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  ok(
    await adminApi.public('POST', '/api/detection_engine/index'),
    'create the detection alerts index'
  );

  const rule = ok(
    await adminApi.public<{ id: string; revision: number }>('POST', '/api/detection_engine/rules', {
      body: {
        name: `E2E noisy backup rule ${runMarker}`,
        rule_id: `e2e-noisy-backup-${runMarker}`,
        description: 'AlertZero e2e seeded noisy rule',
        type: 'query',
        status: 'active',
        severity: 'low',
        risk_score: 10,
        interval: '5m',
        from: 'now-10m',
        index: [testData.ALERTS_INDEX],
        language: 'kuery',
        query: 'user.name:*',
      },
    }),
    'create the detection rule'
  );

  const alertDoc = (closed: boolean, number: number) => ({
    '@timestamp': new Date(Date.now() - number * 60_000).toISOString(),
    labels: { ad_portable_seed: runMarker },
    rule: { id: rule.id, name: `E2E noisy backup rule ${runMarker}` },
    host: { name: FP_HOST },
    user: { name: closed ? FP_USER : TP_USER },
    'kibana.alert.rule.uuid': rule.id,
    'kibana.alert.rule.name': `E2E noisy backup rule ${runMarker}`,
    'kibana.alert.rule.revision': rule.revision,
    'kibana.alert.workflow_status': closed ? 'closed' : 'open',
    ...(closed ? { 'kibana.alert.workflow_reason': 'false_positive' } : {}),
    'kibana.alert.workflow_tags': [],
    'kibana.alert.severity': 'low',
    'kibana.alert.status': closed ? 'closed' : 'active',
    message: closed
      ? `${FP_USER} backup job flagged again`
      : `${TP_USER} interactive access flagged`,
  });
  const documents = [
    ...Array.from({ length: FP_COUNT }, (_, i) => alertDoc(true, i)),
    ...Array.from({ length: OPEN_COUNT }, (_, i) => alertDoc(false, FP_COUNT + i)),
  ];
  const response = await esClient.bulk({
    refresh: 'wait_for',
    operations: documents.flatMap((doc, i) => [
      { index: { _index: testData.ALERTS_INDEX, _id: `${runMarker}-${i}` } },
      doc,
    ]),
  });
  if (response.errors) {
    throw new Error(`Seeding rule alerts failed: ${JSON.stringify(response.items.slice(0, 3))}`);
  }

  return { ruleId: rule.id, revision: rule.revision, runMarker, alertIds: [] };
};

apiTest.describe('AlertZero e2e - rule tuning', { tag: [...tags.stateful.classic] }, () => {
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
      if (api && seededRule) {
        // A rule with an exception cannot always be deleted in one shot; ignore the error so
        // cleanup of the rest still runs. The rule is inert without its seeded alerts.
        await api
          .public(
            'DELETE',
            `/api/detection_engine/rules?id=${encodeURIComponent(seededRule.ruleId)}`
          )
          .catch(() => undefined);
      }
    });
    await attempt(async () => {
      if (esClientRef && seededRule) {
        await esClientRef.deleteByQuery({
          index: testData.ALERTS_INDEX,
          conflicts: 'proceed',
          refresh: true,
          query: { term: { 'labels.ad_portable_seed': seededRule.runMarker } },
        });
      }
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
    'tunes a noisy rule with an exception scoped to the FP pattern',
    async ({ apiClient, samlAuth, esClient }) => {
      apiTest.setTimeout(testData.GENERATION_TIMEOUT_MS + 2 * testData.PROPOSAL_TIMEOUT_MS);
      const adminApi = await getAdminApi(apiClient, samlAuth);
      api = adminApi;
      esClientRef = esClient;

      seededRule = await seedNoisyRule(adminApi, esClient);
      const rule = seededRule;
      const startedAt = new Date().toISOString();

      // P1 shape: install the worker's workflow by saving its settings, then enable. The
      // immediate scheduled run is the sweep under test, executing as the service account.
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
      const workerWorkflowId = worker.workflowId;
      if (!workerWorkflowId) {
        throw new Error(`Worker ${WORKER_ID} has no workflow installed`);
      }
      const knownExecutionIds = [
        ...(await listExecutionIds(adminApi, workerWorkflowId)),
        ...(await listExecutionIds(adminApi, TUNING_REVIEW_WORKFLOW_ID)),
      ];
      expect((await updateWorker(adminApi, WORKER_ID, { enabled: true })).enabled).toBe(true);
      const sweepExecutionId = await waitForNewExecution(
        adminApi,
        workerWorkflowId,
        knownExecutionIds,
        { timeoutMs: testData.ACTION_TIMEOUT_MS }
      );
      const sweep = await waitForExecution(
        adminApi,
        'the rule tuning sweep execution to finish',
        sweepExecutionId,
        { timeoutMs: testData.GENERATION_TIMEOUT_MS }
      );
      await assertExecutionCompleted(adminApi, 'The rule tuning sweep execution', sweep);

      // Manual autonomy gates the diagnosis behind a "Review rule for tuning" entry proposal on
      // the rule's investigation. Approve it exactly as the modal does.
      entryProposal = await pollUntil(
        'the review-gate proposal for the seeded rule',
        async () =>
          (
            await listPendingProposals(adminApi)
          ).find(
            (proposal) =>
              proposal.comment.includes('Review rule for tuning') &&
              proposal.comment.includes(rule.runMarker) &&
              proposal.createdAt >= startedAt
          ),
        { timeoutMs: testData.PROPOSAL_TIMEOUT_MS }
      );
      await approveProposal(adminApi, entryProposal);

      // The diagnosis then proposes the tuning itself: an exception (or an edit) on the rule.
      const tuningProposal = await pollUntil(
        'the tuning proposal for the seeded rule',
        async () =>
          (
            await listPendingProposals(adminApi)
          ).find((proposal) => {
            if (proposal.createdAt < startedAt || !proposal.actionInput) {
              return false;
            }
            const input = JSON.stringify(proposal.actionInput);
            return (
              input.includes(rule.ruleId) &&
              (proposal.actionWorkflowId === testData.ADD_RULE_EXCEPTION_ACTION_ID ||
                proposal.actionWorkflowId === testData.EDIT_RULE_ACTION_ID)
            );
          }),
        { timeoutMs: testData.GENERATION_TIMEOUT_MS }
      );

      // The exception must be scoped to the observed FP pattern, not to the rule at large.
      const entries = JSON.stringify(tuningProposal.actionInput);
      expect(entries).toContain(FP_USER);

      // Negative control: a true positive from another user must stay outside the exception.
      expect(entries).not.toContain(TP_USER);

      // Approve and verify the exception landed on the rule itself.
      await approveProposal(adminApi, tuningProposal);
      await pollUntil(
        'the exception to appear on the rule',
        async () => {
          const after = ok(
            await adminApi.public<{ exceptions_list?: unknown[]; revision: number }>(
              'GET',
              `/api/detection_engine/rules?id=${encodeURIComponent(rule.ruleId)}`
            ),
            'read the tuned rule'
          );
          const serialized = JSON.stringify(after.exceptions_list ?? []);
          return serialized.includes(FP_USER) ? after : undefined;
        },
        { timeoutMs: testData.ACTION_TIMEOUT_MS }
      );
    }
  );

  // Known gap, expected to fail until security-team#19992 lands: the fp rate in the review
  // proposal renders rounded (57%) instead of the computed value (57.14...%). Asserts on the
  // entry proposal created by the test above, so it costs no additional model calls.
  apiTest.fail('renders the false-positive rate unrounded (security-team#19992)', async () => {
    const entry = entryProposal;
    if (!entry) {
      throw new Error('the green tuning test must run first to create the entry proposal');
    }
    // 12/21 = 57.142...% — the rounded render the review emits today drops the fraction.
    expect(entry.comment).toContain('57.14');
  });
});
