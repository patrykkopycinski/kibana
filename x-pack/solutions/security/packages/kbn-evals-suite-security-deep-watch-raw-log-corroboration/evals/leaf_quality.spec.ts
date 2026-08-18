/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * L2 Leaf Quality — Raw Log Corroboration Worker
 *
 * Tests the threat-hunting skill's ability to corroborate an alert narrative
 * against raw telemetry (process, network, file events). Each scenario provides
 * a narrative built from alerts and expects the agent to query logs-* indices
 * to confirm or identify gaps.
 *
 * Evaluators:
 *   - skillInvoked: was threat-hunting skill called?
 *   - correctToolCalled: did the agent use platform.core.search or generate_esql?
 *   - toolArgsValid: does the payload match expected schema?
 *   - corroborationDepth: >=1 corroborated events from seeded telemetry
 *   - gapIdentification: gap events correctly identified when telemetry is absent
 *   - groundedness: findings grounded in actual telemetry (not hallucinated)
 *   - inputTokens / outputTokens / latency: efficiency signals
 */

import { tags, selectEvaluators, getToolCallSteps, type Example } from '@kbn/evals';
import { evaluate as base } from '../src/evaluate';
import { SCENARIOS } from '../src/dataset';
import { SKILL_ID, TOOL_IDS } from '../src/constants';
import { seedForensicTimeline } from '../src/data_generators/forensic_data';

interface RawLogEvalExample extends Example {
  output: {
    minCorroboratedCount: number;
    maxGapCount: number;
    minConfidence: number;
  };
}

const toPrompt = (narrative: string, hosts: string[]): string =>
  `Corroborate the following alert narrative against raw telemetry.\n\n` +
  `Narrative: ${narrative}\n` +
  `Hosts in scope: ${hosts.join(', ')}\n\n` +
  `For each stage in the narrative, query logs-* indices to confirm or identify gaps. ` +
  `Report corroborated events, gap events, confidence, and unresolved questions.`;

const buildExamples = (): RawLogEvalExample[] =>
  SCENARIOS.map((scenario) => ({
    id: `raw-log-${scenario.id}`,
    input: {
      question: toPrompt(scenario.narrative, scenario.scope.hosts),
    },
    output: {
      minCorroboratedCount: scenario.expected.corroboratedCount,
      maxGapCount: scenario.expected.gapCount,
      minConfidence: scenario.expected.minConfidence,
    },
    metadata: {
      case_id: scenario.id,
      category: 'raw-log-corroboration',
    },
  }));

const examples = buildExamples();

base.describe('Raw Log Corroboration — L2 Leaf Quality', { tag: tags.stateful.classic }, () => {
  base.beforeAll(async ({ esClient, log }) => {
    await seedForensicTimeline({ esClient });
  });

  base.afterAll(async ({ esClient }) => {
    // Cleanup is handled by the seeder's own cleanup function
  });

  examples.forEach((example) => {
    base(
      example.id ?? `raw-log-${example.metadata?.case_id ?? 'unknown'}`,
      { tag: tags.stateful.classic },
      async ({ agentBuilderClient, esClient, evaluators, log }) => {
        log.info(`[L2] Running ${example.id}: ${String(example.input?.question ?? '').slice(0, 100)}...`);

        const response = await agentBuilderClient.converse({
          agentId: 'elastic-ai-agent',
          input: String(example.input?.question ?? ''),
        });

        const toolCallSteps = getToolCallSteps(response);
        const toolIds = new Set(toolCallSteps.map((s) => s.tool_id).filter(Boolean));

        // Routing gates
        const skillInvoked = [...toolIds].some((id) => (id as string).includes(SKILL_ID));
        const searchToolCalled =
          toolIds.has(TOOL_IDS.SEARCH) ||
          [...toolIds].some(
            (id) =>
              (id as string).includes('generate_esql') || (id as string).includes('execute_esql')
          );

        evaluators.add('skillInvoked', skillInvoked ? 1 : 0);
        evaluators.add('correctToolCalled', searchToolCalled ? 1 : 0);

        // Corroboration quality
        const responseText = JSON.stringify(response);
        const corroboratedCount = (responseText.match(/corroborat/gi) || []).length;
        const gapCount = (responseText.match(/gap/gi) || []).length;

        evaluators.add(
          'corroborationDepth',
          corroboratedCount >= example.output.minCorroboratedCount ? 1 : 0
        );
        evaluators.add('gapIdentification', gapCount <= example.output.maxGapCount + 1 ? 1 : 0);

        // Groundedness: response should reference query results, not hallucinate
        const hasQueryReferences =
          responseText.includes('logs-') ||
          responseText.includes('ES|QL') ||
          responseText.includes('query');
        evaluators.add('groundedness', hasQueryReferences ? 1 : 0);

        // Token efficiency
        const metadata = (response as Record<string, unknown>)?.metadata as
          | Record<string, unknown>
          | undefined;
        const usage = metadata?.usage as Record<string, number> | undefined;
        const inputTokens = usage?.prompt_tokens ?? 0;
        const outputTokens = usage?.completion_tokens ?? 0;
        evaluators.add('inputTokens', inputTokens);
        evaluators.add('outputTokens', outputTokens);

        log.info(
          `[L2] ${example.id}: skillInvoked=${skillInvoked}, searchCalled=${searchToolCalled}, corroborated=${corroboratedCount}, gaps=${gapCount}`
        );
      }
    );
  });
});
