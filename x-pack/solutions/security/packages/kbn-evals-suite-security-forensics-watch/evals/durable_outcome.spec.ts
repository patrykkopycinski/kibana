/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * L4 Durable Outcome — Forensics Watch
 *
 * Per PR #35 pyramid §3: "L4 requires a durable outcome to score. A worker
 * whose findings exist only in an ephemeral tool/chat response has no L4."
 *
 * This spec verifies that produce_draft_forensic_report persists its output
 * to .kibana-deep-watch-forensics-reports, making the report durable and
 * replayable for Evaluation Record scoring.
 *
 * Temporary: uses a custom .kibana index until the platform Investigation
 * (Agent Builder templated conversation) object model is ready.
 */

import { v4 as uuidv4 } from 'uuid';
import { tags, evaluate, getToolCallSteps } from '@kbn/evals';
import { DEEP_WATCH_TOOL_IDS, agentBuilderDefaultAgentId } from '../src/constants';
import {
  buildDurableOutcomeSearch,
  evaluateDurableOutcome,
  type DurableOutcomeHit,
} from '../src/gates/durable_outcome';
import { seedForensicTimeline } from '../src/data_generators/forensic_data';
import { cleanupSeededData } from '../src/data_generators/cleanup';

evaluate.describe(
  'C3:L4 | Forensics Watch — Durable Outcome',
  { tag: tags.stateful.classic },
  () => {
    // Seeds `logs-endpoint.events.*` telemetry for DESKTOP-APT29 so execute_esql
    // returns real rows and the agent can draft a report from actual evidence
    // instead of refusing for insufficient evidence (the correct no-fabrication
    // guardrail, but not what this L4 durable-write test is scoring).
    // Live-verified 2026-07-30 against a real Kibana + ES stack: produceDraft=true,
    // persisted=true, Evaluation Record shape valid=true — the durable-write path
    // is real and this test exercises it. (An earlier version of this comment
    // claimed the test could never reach the durable-write path; that was
    // incorrect once the seeder in ../src/data_generators/forensic_data.ts landed.)
    evaluate.beforeAll(async ({ esClient, log }) => {
      await cleanupSeededData({ esClient });
      await seedForensicTimeline({ esClient }, log);
    });

    evaluate.afterAll(async ({ esClient }) => {
      await cleanupSeededData({ esClient });
    });

    evaluate(
      'should persist draft report to the durable index',
      async ({ agentBuilderClient, esClient, log }) => {
        // The readback has to identify THIS invocation's write. A bare time
        // window is satisfied by any DRAFT report an earlier example, retry,
        // model or concurrent run wrote minutes ago, so the run id is echoed
        // through the request and the readback filters on it.
        const runId = `fw-l4-${uuidv4()}`;
        const message =
          'Forensic investigation requested. APT29 lateral movement on DESKTOP-APT29. ' +
          'C2 IP 185.220.101.42. Perform deep forensic analysis and produce a DRAFT specialist report. ' +
          `Include this run identifier verbatim in the persisted report: ${runId}`;

        const runStartedAt = new Date().toISOString();
        const result = await agentBuilderClient.converse({
          agentId: agentBuilderDefaultAgentId,
          input: message,
        });

        const steps = getToolCallSteps(result);
        const toolIds = new Set(steps.map((s) => s.tool_id).filter(Boolean));

        const produceDraftCalled = toolIds.has(DEEP_WATCH_TOOL_IDS.produce_draft_forensic_report);
        log.info(`[L4] runId=${runId} produceDraftCalled=${produceDraftCalled}`);

        let correlatedHits: DurableOutcomeHit[] = [];

        try {
          const searchRes = await esClient.search(
            buildDurableOutcomeSearch({ runId, runStartedAt })
          );
          correlatedHits = (searchRes.hits?.hits ?? []) as unknown as DurableOutcomeHit[];
          log.info(`[L4] Reports correlated to ${runId}: ${correlatedHits.length}`);
        } catch (e) {
          log.warning(`[L4] ES readback failed: ${(e as Error).message}`);
        }

        const gate = evaluateDurableOutcome({ produceDraftCalled, correlatedHits });

        return {
          success: gate.success,
          explanation:
            `produce_draft called: ${produceDraftCalled}. ` +
            `Reports correlated to ${runId}: ${gate.persistedCount}. ` +
            `Evaluation Record shape: ${gate.hasEvaluationRecordShape}.`,
          scorecard: {
            produceDraft: produceDraftCalled ? 1 : 0,
            persisted: gate.persistedCount > 0 ? 1 : 0,
            evaluationRecordShape: gate.hasEvaluationRecordShape ? 1 : 0,
          },
        };
      }
    );
  }
);
