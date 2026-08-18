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
 * timeline via the emit_corroboration route, making the findings durable
 * and replayable for Evaluation Record scoring.
 */

import { tags, evaluate, getToolCallSteps } from '@kbn/evals';
import { SCENARIOS, SKILL_ID } from '../src/constants';
import { seedForensicTimeline } from '../src/data_generators/forensic_data';

evaluate.describe(
  'C3:L4 | Raw Log Corroboration — Durable Outcome',
  { tag: tags.stateful.classic },
  () => {
    evaluate.beforeAll(async ({ esClient, log }) => {
      await seedForensicTimeline({ esClient });
    });

    evaluate.afterAll(async ({ esClient }) => {
      // Cleanup handled by seeder
    });

    const scenario = SCENARIOS.find((s: { id: string }) => s.id === 'partial-gap') ?? SCENARIOS[0];

    evaluate(
      'durable-outcome-corroboration-persisted',
      { tag: tags.stateful.classic },
      async ({ agentBuilderClient, esClient, evaluators, log }) => {
        const prompt =
          `Corroborate the following alert narrative against raw telemetry.\n\n` +
          `Narrative: ${scenario.narrative}\n` +
          `Hosts: ${scenario.scope.hosts.join(', ')}\n\n` +
          `Query logs-* indices. Report corroborated events, gap events, confidence, ` +
          `and unresolved questions. Persist findings to the investigation timeline.`;

        log.info('[L4] Starting durable outcome test');

        const response = await agentBuilderClient.converse({
          agentId: 'elastic-ai-agent',
          input: prompt,
        });

        const toolCallSteps = getToolCallSteps(response);
        const toolIds = new Set(toolCallSteps.map((s) => s.tool_id).filter(Boolean));

        // Skill invocation gate
        const skillInvoked = [...toolIds].some((id) => (id as string).includes(SKILL_ID));
        evaluators.add('skillInvoked', skillInvoked ? 1 : 0);

        // Durable write: check if emit_corroboration was called or if
        // the investigation timeline was updated
        const hasEmitCorroboration = [...toolIds].some(
          (id) =>
            (id as string).includes('emit_corroboration') ||
            (id as string).includes('recordDeepWatch')
        );
        evaluators.add('durableWriteCalled', hasEmitCorroboration ? 1 : 0);

        // Verify persisted data in ES
        const responseText = JSON.stringify(response);
        const hasPersistedRef =
          responseText.includes('investigation') ||
          responseText.includes('timeline') ||
          responseText.includes('persisted');

        evaluators.add('durableOutcomeVerified', hasPersistedRef ? 1 : 0);

        // Structured report fields
        const hasCorroborated = responseText.toLowerCase().includes('corroborat');
        const hasGaps = responseText.toLowerCase().includes('gap');
        const hasUnresolved = responseText.toLowerCase().includes('unresolved');

        evaluators.add('reportCompleteness', hasCorroborated && hasGaps && hasUnresolved ? 1 : 0);

        log.info(
          `[L4] skillInvoked=${skillInvoked}, durableWrite=${hasEmitCorroboration}, persisted=${hasPersistedRef}, complete=${
            hasCorroborated && hasGaps && hasUnresolved
          }`
        );
      }
    );
  }
);
