/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * L4 Durable Outcome — Raw Log Corroboration Worker
 *
 * Per PR #35 pyramid: "L4 requires a durable outcome to score. A worker
 * whose findings exist only in an ephemeral tool/chat response has no L4."
 *
 * Verifies that the corroboration report is persisted to the Investigation
 * timeline, making the findings durable and replayable for Evaluation Record
 * scoring. Persistence is read back from ES and correlated by a per-run id
 * echoed through the request: a response that merely mentions "persisted" or
 * "timeline" is prose, not evidence of a durable write.
 */

import { v4 as uuidv4 } from 'uuid';
import { tags, evaluate, getToolCallSteps } from '@kbn/evals';
import { SCENARIOS } from '../src/dataset';
import { logScorecard } from '../src/scorecard_log';
import { SKILL_ID } from '../src/constants';
import {
  buildInvestigationReadbackSearch,
  evaluateDurableOutcome,
  type DurableOutcomeHit,
} from '../src/durable_outcome';
import { seedForensicTimeline } from '../src/data_generators/forensic_data';

evaluate.describe(
  'C3:L4 | Raw Log Corroboration — Durable Outcome',
  { tag: tags.stateful.classic },
  () => {
    evaluate.beforeAll(async ({ esClient, log }) => {
      for (const scenario of SCENARIOS) {
        await seedForensicTimeline({ esClient, scenario });
      }
    });

    evaluate.afterAll(async ({ esClient }) => {
      // Cleanup handled by seeder
    });

    const scenario = SCENARIOS.find((s) => s.id === 'partial-gap') ?? SCENARIOS[0];

    evaluate(
      'should persist corroboration findings to investigation timeline',
      { tag: tags.stateful.classic },
      async ({ agentBuilderClient, esClient, evaluators, log }) => {
        // A time-window readback is satisfied by an investigation another run
        // wrote minutes ago, so the run id travels with the request and the
        // readback filters on it.
        const runId = `rl-l4-${uuidv4()}`;
        const prompt =
          `Corroborate the following alert narrative against raw telemetry.\n\n` +
          `Narrative: ${scenario.narrative}\n` +
          `Hosts: ${scenario.scope.hosts.join(', ')}\n\n` +
          `Query logs-* indices. Report corroborated events, gap events, confidence, ` +
          `and unresolved questions. Persist findings to the investigation timeline ` +
          `and include this run identifier verbatim in the persisted record: ${runId}`;

        log.info('[L4] Starting durable outcome test');

        const runStartedAt = new Date().toISOString();
        const response = await agentBuilderClient.converse({
          agentId: 'elastic-ai-agent',
          input: prompt,
        });

        const toolCallSteps = getToolCallSteps(response);
        const toolIds = new Set(toolCallSteps.map((s) => s.tool_id).filter(Boolean));

        // Skill invocation gate
        const skillInvoked = [...toolIds].some((id) => (id as string).includes(SKILL_ID));

        // Structured report fields
        const responseText = JSON.stringify(response).toLowerCase();
        const hasCorroborated = responseText.includes('corroborat');
        const hasGaps = responseText.includes('gap');
        const hasUnresolved = responseText.includes('unresolved');

        const reportComplete = hasCorroborated && hasGaps && hasUnresolved;

        let correlatedHits: DurableOutcomeHit[] = [];
        try {
          const searchRes = await esClient.search(
            buildInvestigationReadbackSearch({ runId, runStartedAt })
          );
          correlatedHits = (searchRes.hits?.hits ?? []) as unknown as DurableOutcomeHit[];
        } catch (e) {
          log.warning(`[L4] investigation readback failed: ${(e as Error).message}`);
        }

        const durable = evaluateDurableOutcome({ correlatedHits });
        const success = skillInvoked && durable.success && reportComplete;

        log.info(
          `[L4] skillInvoked=${skillInvoked}, runId=${runId}, ` +
            `recordsCorrelatedToRun=${durable.persistedCount}, ` +
            `corroborationStored=${durable.corroborationContentStored}, complete=${reportComplete}`
        );

        const scorecard = {
          skillInvoked: skillInvoked ? 1 : 0,
          durableOutcomeVerified: durable.success ? 1 : 0,
          reportCompleteness: reportComplete ? 1 : 0,
        };

        logScorecard(log, { level: 'L4', exampleId: scenario.id, scorecard });

        return {
          success,
          explanation:
            `Skill invoked: ${skillInvoked}. ` +
            `Investigation records carrying ${runId}: ${durable.persistedCount}. ` +
            `Corroboration content stored: ${durable.corroborationContentStored}. ` +
            `Report complete: ${reportComplete}.`,
          scorecard,
        };
      }
    );
  }
);
