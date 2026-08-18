/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * L3 Composite Pipeline — Raw Log Corroboration Worker
 *
 * Tests the full multi-tool orchestration:
 *   1. Agent receives alert narrative + host scope
 *   2. Agent queries logs-endpoint.events.* via ES|QL for process/network/file events
 *   3. Agent correlates findings with narrative stages
 *   4. Agent produces structured corroboration report (corroborated + gaps + confidence)
 *
 * Verifies the complete pipeline from narrative input to structured output,
 * including pivot logic (finding a suspicious process triggers additional checks).
 */

import { tags, evaluate, getToolCallSteps } from '@kbn/evals';
import { SCENARIOS } from '../src/dataset';
import { SKILL_ID, TOOL_IDS } from '../src/constants';
import { seedForensicTimeline } from '../src/data_generators/forensic_data';

evaluate.describe(
  'C3:L3 | Raw Log Corroboration — Composite pipeline',
  { tag: tags.stateful.classic },
  () => {
    evaluate.beforeAll(async ({ esClient, log }) => {
      await seedForensicTimeline({ esClient });
    });

    evaluate.afterAll(async ({ esClient }) => {
      // Cleanup handled by seeder
    });

    const scenario = SCENARIOS.find((s: { id: string }) => s.id === 'full-corroboration') ?? SCENARIOS[0];

    evaluate(
      'composite-pipeline-full-corroboration',
      { tag: tags.stateful.classic },
      async ({ agentBuilderClient, esClient, evaluators, log }) => {
        const prompt =
          `Corroborate the following alert narrative against raw telemetry.\n\n` +
          `Narrative: ${scenario.narrative}\n` +
          `Hosts: ${scenario.scope.hosts.join(', ')}\n` +
          `Time range: ${scenario.scope.timeRange.from} to ${scenario.scope.timeRange.to}\n\n` +
          `Query logs-endpoint.events.* indices. For each narrative stage, confirm or identify gaps. ` +
          `If a suspicious process is found, pivot to check persistence and lateral movement indicators.`;

        log.info('[L3] Starting composite pipeline test');

        const response = await agentBuilderClient.converse({
          agentId: 'elastic-ai-agent',
          input: prompt,
        });

        const toolCallSteps = getToolCallSteps(response);
        const toolIds = new Set(toolCallSteps.map((s) => s.tool_id).filter(Boolean));

        // Pipeline gates: verify multi-tool orchestration
        const hasDiscovery = [...toolIds].some(
          (id) =>
            (id as string).includes('list_indices') || (id as string).includes('get_index_mapping')
        );
        const hasEsql = [...toolIds].some(
          (id) =>
            (id as string).includes('generate_esql') || (id as string).includes('execute_esql')
        );
        const hasSearch = toolIds.has(TOOL_IDS.SEARCH);
        const hasSkillInvoke = [...toolIds].some((id) => (id as string).includes(SKILL_ID));

        evaluators.add('pipelineDiscovery', hasDiscovery ? 1 : 0);
        evaluators.add('pipelineEsql', hasEsql ? 1 : 0);
        evaluators.add('pipelineSearch', hasSearch ? 1 : 0);
        evaluators.add('pipelineSkillInvoked', hasSkillInvoke ? 1 : 0);

        // Multi-step: at least 2 tool calls (discovery + query)
        const minToolCalls = 2;
        evaluators.add('pipelineMultiStep', toolCallSteps.length >= minToolCalls ? 1 : 0);

        // Structured output: response should contain corroboration report fields
        const responseText = JSON.stringify(response);
        const hasCorroborated = responseText.toLowerCase().includes('corroborat');
        const hasGaps = responseText.toLowerCase().includes('gap');
        const hasConfidence = responseText.toLowerCase().includes('confidence');

        evaluators.add(
          'pipelineStructuredOutput',
          hasCorroborated && hasGaps && hasConfidence ? 1 : 0
        );

        // Pivot logic: if process events found, should also check persistence/lateral
        const hasProcessQuery =
          responseText.includes('process') || responseText.includes('logs-endpoint.events.process');
        const hasPersistenceCheck =
          responseText.includes('persistence') ||
          responseText.includes('registry') ||
          responseText.includes('scheduled');
        const hasLateralCheck =
          responseText.includes('lateral') || responseText.includes('network');

        evaluators.add(
          'pipelinePivotLogic',
          hasProcessQuery && (hasPersistenceCheck || hasLateralCheck) ? 1 : 0
        );

        log.info(
          `[L3] tools=${toolIds.size}, esql=${hasEsql}, structured=${
            hasCorroborated && hasGaps && hasConfidence
          }, pivot=${hasProcessQuery && (hasPersistenceCheck || hasLateralCheck)}`
        );
      }
    );
  }
);
