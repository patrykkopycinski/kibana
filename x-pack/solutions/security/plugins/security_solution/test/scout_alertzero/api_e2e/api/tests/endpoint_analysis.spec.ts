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
  cleanupKnowledgeIndicators,
  createInvestigation,
  createServiceAccount,
  ensureInvestigationsAiIndex,
  deleteServiceAccount,
  getAdminApi,
  getWorker,
  listAttachments,
  listExecutionIds,
  listPendingProposals,
  pollUntil,
  readKnowledgeIndicator,
  resetWorker,
  seedAttackScenario,
  seedKnowledgeIndicator,
  updateWorker,
  waitForExecution,
  waitForNewExecution,
} from '../fixtures';
import type { AlertZeroApi, SeededScenario } from '../fixtures';

const WORKER_ID = testData.FORENSICS_ENDPOINT_ANALYSIS_WORKER_ID;
const RUN_WORKFLOW_ID = testData.FORENSICS_RUN_ENDPOINT_ANALYSIS_WORKFLOW_ID;

/** The Attack Discovery alert index the run workflow resolves the handoff target from. */
const ATTACK_DISCOVERY_ALERTS_INDEX = '.alerts-security.attack.discovery.alerts-default';

// afterAll runs even when the body throws, so the seeded state escapes through here.
let scenario: SeededScenario | undefined;
let api: AlertZeroApi | undefined;
let esClientRef: EsClient | undefined;
let serviceAccountId: string | undefined;
const kiIds: string[] = [];

/**
 * Seeds everything one `security.analyze_endpoint` handoff needs — the attack chain's alerts, an
 * Attack Discovery alert that correlates them, and an Investigation to attach findings to — then
 * enables the forensics worker and lets its scheduled sweep run as the worker's service account.
 * Returns what the assertions need: the ids the run must cite and where its findings must land.
 */
const runEndpointAnalysis = async (
  adminApi: AlertZeroApi,
  esClient: EsClient,
  scenarioKey: string
) => {
  const seeded = await seedAttackScenario(esClient, adminApi, { scenarioKey });
  const attackDiscoveryAlertId = `e2e-ad-${seeded.runMarker}`;
  const hostName = 'wks-alice-01';

  // The run workflow dereferences the handoff ids rather than carrying a snapshot, so the
  // Attack Discovery alert it looks up must exist and must point at the seeded chain's alerts.
  await esClient.index({
    index: ATTACK_DISCOVERY_ALERTS_INDEX,
    id: attackDiscoveryAlertId,
    refresh: 'wait_for',
    document: {
      '@timestamp': new Date().toISOString(),
      labels: { ad_portable_seed: seeded.runMarker },
      'kibana.alert.uuid': attackDiscoveryAlertId,
      'kibana.alert.attack_discovery.alert_ids': seeded.alertIds,
      host: { name: hostName },
    },
  });

  const conversationId = await createInvestigation(
    adminApi,
    `Endpoint analysis e2e ${seeded.runMarker}`,
    `Seeded investigation for run ${seeded.runMarker}`
  );
  await ensureInvestigationsAiIndex(adminApi);
  const kiId = await seedKnowledgeIndicator(esClient, {
    kiId: `e2e-analyze-endpoint-${seeded.runMarker}`,
    type: 'security.analyze_endpoint',
    title: `Forensics handoff for Attack Discovery ${attackDiscoveryAlertId}`,
    description: `Seeded handoff for run ${seeded.runMarker}`,
    attributes: {
      attack_discovery_alert_id: attackDiscoveryAlertId,
      investigation_id: conversationId,
    },
  });
  kiIds.push(kiId);

  // Same shape as P1: bind a service account, wait for the settings write to install the
  // workflow, then enable — the immediate scheduled run is the sweep under test, executing as
  // the service account so `run-as-mode: inherit` dispatches resolve.
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
  const knownExecutionIds = await listExecutionIds(adminApi, workerWorkflowId);
  expect((await updateWorker(adminApi, WORKER_ID, { enabled: true })).enabled).toBe(true);
  const sweepExecutionId = await waitForNewExecution(
    adminApi,
    workerWorkflowId,
    knownExecutionIds,
    { timeoutMs: testData.ACTION_TIMEOUT_MS }
  );
  const sweep = await waitForExecution(
    adminApi,
    'the forensics sweep execution to finish',
    sweepExecutionId,
    { timeoutMs: testData.GENERATION_TIMEOUT_MS }
  );
  await assertExecutionCompleted(adminApi, 'The forensics sweep execution', sweep);

  // The sweep dispatches one run per pending indicator, so poll for a run of THIS workflow the
  // sweep started rather than assuming the sweep's only dispatch is ours.
  const runExecutionId = await pollUntil(
    `an execution of ${RUN_WORKFLOW_ID} started after the sweep`,
    async () =>
      (
        await listExecutionIds(adminApi, RUN_WORKFLOW_ID)
      ).find((id) => !knownExecutionIds.includes(id)),
    { timeoutMs: testData.ACTION_TIMEOUT_MS }
  );
  const run = await waitForExecution(
    adminApi,
    'the endpoint analysis run execution to finish',
    runExecutionId,
    { timeoutMs: testData.GENERATION_TIMEOUT_MS }
  );
  await assertExecutionCompleted(adminApi, 'The endpoint analysis run execution', run);

  return {
    scenario: seeded,
    kiId,
    attackDiscoveryAlertId,
    investigationId: conversationId,
    hostName,
  };
};

apiTest.describe('AlertZero e2e - endpoint analysis', { tag: [...tags.stateful.classic] }, () => {
  apiTest.afterAll(async ({ apiClient, samlAuth }) => {
    // Every step runs even when an earlier one throws, so one failure cannot leak the seeded
    // scenario, the Attack Discovery alert, the indicator, the service account or the worker.
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
      if (esClientRef && scenario) {
        await esClientRef.deleteByQuery({
          index: ATTACK_DISCOVERY_ALERTS_INDEX,
          conflicts: 'proceed',
          refresh: true,
          query: { term: { 'labels.ad_portable_seed': scenario.runMarker } },
        });
      }
    });
    await attempt(async () => {
      if (esClientRef) await cleanupKnowledgeIndicators(esClientRef, kiIds);
    });
    await attempt(async () => {
      await scenario?.cleanup();
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
    'analyzes a seeded endpoint and cites ids that exist in the seed',
    async ({ apiClient, samlAuth, esClient }) => {
      apiTest.setTimeout(testData.GENERATION_TIMEOUT_MS * 2);
      const adminApi = await getAdminApi(apiClient, samlAuth);
      api = adminApi;
      esClientRef = esClient;

      const context = await runEndpointAnalysis(adminApi, esClient, testData.ATTACK_SCENARIO_KEY);
      scenario = context.scenario;

      // The findings land on the investigation as timeline + IoC attachments whose ids are
      // derived from the indicator id the run was handed.
      const attachments = await pollUntil(
        'the forensic timeline and IoC attachments',
        async () => {
          const found = await listAttachments(adminApi, context.investigationId);
          const serialized = JSON.stringify(found);
          return serialized.includes(`forensic-timeline-${context.kiId}`) &&
            serialized.includes(`forensic-iocs-${context.kiId}`)
            ? found
            : undefined;
        },
        { timeoutMs: testData.ACTION_TIMEOUT_MS }
      );

      // Structural: the analysis may only cite a host that exists in the seed. The only host in
      // play is the seeded one, so it must appear and no other hostname shape is asserted.
      expect(JSON.stringify(attachments)).toContain(context.hostName);

      // The journaling mark: the indicator leaves `pending` once the run has recorded its
      // assessment, processed or not — what matters is that the run wrote back.
      const indicator = await pollUntil(
        `indicator ${context.kiId} to leave pending`,
        async () => {
          const current = await readKnowledgeIndicator(esClient, context.kiId);
          return current.status && current.status !== 'pending' ? current : undefined;
        },
        { timeoutMs: testData.ACTION_TIMEOUT_MS }
      );
      expect(indicator.found).toBe(true);
    }
  );

  // Known gap, expected to fail until security-team#19991 lands: containment proposals for two
  // different hosts must be distinguishable (distinct endpoint ids / hosts per proposal, not one
  // shared proposal or merged inputs). Seeds a second chain on a second host; the still-enabled
  // worker's next scheduled sweep analyzes it too.
  apiTest.fail(
    'keeps containment proposals for two hosts distinguishable (security-team#19991)',
    async ({ esClient }) => {
      // The poll below waits GENERATION_TIMEOUT_MS; the test timeout must outlast it, because a
      // Playwright timeout is not an expected failure and would be reported red despite the marker.
      apiTest.setTimeout(testData.GENERATION_TIMEOUT_MS + 2 * testData.ACTION_TIMEOUT_MS);
      esClientRef = esClient;
      const adminApi = api;
      if (!adminApi) {
        throw new Error('the green endpoint analysis test must run first');
      }
      const startedAt = new Date().toISOString();

      const seeded = await seedAttackScenario(esClient, adminApi, { scenarioKey: 'bits-mshta' });
      scenario = seeded;
      const attackDiscoveryAlertId = `e2e-ad2-${seeded.runMarker}`;
      await esClient.index({
        index: ATTACK_DISCOVERY_ALERTS_INDEX,
        id: attackDiscoveryAlertId,
        refresh: 'wait_for',
        document: {
          '@timestamp': new Date().toISOString(),
          labels: { ad_portable_seed: seeded.runMarker },
          'kibana.alert.uuid': attackDiscoveryAlertId,
          'kibana.alert.attack_discovery.alert_ids': seeded.alertIds,
          host: { name: 'wks-jordan-04' },
        },
      });
      const conversationId = await createInvestigation(
        adminApi,
        `Endpoint analysis e2e 2 ${seeded.runMarker}`,
        `Seeded investigation for run ${seeded.runMarker}`
      );
      await ensureInvestigationsAiIndex(adminApi);
      const kiId = await seedKnowledgeIndicator(esClient, {
        kiId: `e2e-analyze-endpoint-${seeded.runMarker}`,
        type: 'security.analyze_endpoint',
        title: `Forensics handoff for Attack Discovery ${attackDiscoveryAlertId}`,
        attributes: {
          attack_discovery_alert_id: attackDiscoveryAlertId,
          investigation_id: conversationId,
        },
      });
      kiIds.push(kiId);

      // Wait until the worker's scheduled sweep has analyzed BOTH indicators: each must have
      // produced its own containment proposal, and the two must name different endpoints.
      const proposals = await pollUntil(
        'two isolate proposals, one per host',
        async () => {
          const pending = (await listPendingProposals(adminApi)).filter(
            (proposal) =>
              proposal.actionWorkflowId === testData.ISOLATE_HOST_ACTION_ID &&
              proposal.createdAt >= startedAt
          );
          return pending.length >= 2 ? pending : undefined;
        },
        { timeoutMs: testData.GENERATION_TIMEOUT_MS }
      );
      const endpointIds = proposals.map(
        (proposal) => (proposal.actionInput?.endpoint_ids ?? []) as string[]
      );
      expect(endpointIds[0].join(',')).not.toBe(endpointIds[1].join(','));
    }
  );
});
