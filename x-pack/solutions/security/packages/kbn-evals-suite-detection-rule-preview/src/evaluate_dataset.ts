/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout';
import {
  getToolCallSteps,
  type DefaultEvaluators,
  type Evaluator,
  type EvaluationDataset,
  type EvalsExecutorClient,
  type ExperimentTask,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type { PreviewConverseCase } from '../datasets/preview_converse_matrix';
import type { DetectionRulePreviewChatClient } from './chat_client';
import { countPreviewAlerts } from './seed';
import type { PreviewConverseTaskInput, PreviewConverseTaskOutput } from './types';

const DETECTION_RULE_EDIT_SKILL = 'detection-rule-edit';
const RUN_RULE_PREVIEW_TOOL_ID = 'security.run_rule_preview';
const PREVIEW_ATTACHMENT_PREFIX = 'security-rule-preview-';

type PreviewExample = PreviewConverseCase & {
  input: PreviewConverseTaskInput;
  output: null;
};

const extractPreviewIds = (steps: PreviewConverseTaskOutput['steps']): string[] => {
  const ids: string[] = [];
  for (const step of steps) {
    if (step.tool_id !== RUN_RULE_PREVIEW_TOOL_ID) {
      continue;
    }
    for (const result of step.results ?? []) {
      const previewId = result.data?.previewId;
      if (typeof previewId === 'string') {
        ids.push(previewId);
      }
    }
  }
  return ids;
};

const getPreviewToolCalls = (output: PreviewConverseTaskOutput) =>
  getToolCallSteps(output).filter((step) => step.tool_id === RUN_RULE_PREVIEW_TOOL_ID);

const skillWasInvoked = (output: PreviewConverseTaskOutput): boolean => {
  for (const step of getToolCallSteps(output)) {
    if (step.tool_id !== 'load_skill') {
      continue;
    }
    const skillParam = (step.params as { skill?: string } | undefined)?.skill;
    if (skillParam === DETECTION_RULE_EDIT_SKILL) {
      return true;
    }
    for (const result of step.results ?? []) {
      const data = (result as { data?: { skill?: { id?: string; name?: string } } }).data;
      if (
        data?.skill?.id === DETECTION_RULE_EDIT_SKILL ||
        data?.skill?.name === DETECTION_RULE_EDIT_SKILL
      ) {
        return true;
      }
    }
  }
  return false;
};

const createSkillInvokedEvaluator = (): Evaluator<PreviewExample, PreviewConverseTaskOutput> => ({
  name: 'SkillInvoked',
  kind: 'CODE',
  evaluate: async ({ output }) => ({
    score: skillWasInvoked(output) ? 1 : 0,
    metadata: { expectedSkill: DETECTION_RULE_EDIT_SKILL },
  }),
});

const createRunRulePreviewEvaluator = (): Evaluator<PreviewExample, PreviewConverseTaskOutput> => ({
  name: 'RunRulePreviewCalled',
  kind: 'CODE',
  evaluate: async ({ output }) => {
    const previewCalls = getPreviewToolCalls(output);
    return {
      score: previewCalls.length > 0 ? 1 : 0,
      metadata: { previewCalls: previewCalls.length },
    };
  },
});

const createPreviewUsesCommandEvaluator = (): Evaluator<PreviewExample, PreviewConverseTaskOutput> => ({
  name: 'PreviewUsesCommand',
  kind: 'CODE',
  evaluate: async ({ output }) => {
    const previewCalls = getPreviewToolCalls(output);
    if (previewCalls.length === 0) {
      return { score: 0, metadata: { reason: 'No preview tool calls' } };
    }
    const firstParams = previewCalls[0].params as { command?: string; rule?: unknown } | undefined;
    const usesCommand = typeof firstParams?.command === 'string' && firstParams.command.length > 0;
    const usesRuleObject = firstParams?.rule !== undefined;
    return {
      score: usesCommand && !usesRuleObject ? 1 : 0,
      metadata: {
        usesCommand,
        usesRuleObject,
        commandPreview:
          typeof firstParams?.command === 'string' ? firstParams.command.slice(0, 160) : undefined,
      },
    };
  },
});

const createPreviewAlertCountEvaluator = (): Evaluator<PreviewExample, PreviewConverseTaskOutput> => ({
  name: 'PreviewAlertCount',
  kind: 'CODE',
  evaluate: async ({ output, metadata }) => {
    const minAlertCount = typeof metadata?.minAlertCount === 'number' ? metadata.minAlertCount : 1;
    const counts = output.previewAlertCounts ?? [];
    const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
    return {
      score: maxCount >= minAlertCount ? 1 : 0,
      metadata: { previewIds: output.previewIds, alertCounts: counts, minAlertCount },
    };
  },
});

const createFirstPreviewNoErrorEvaluator = (): Evaluator<PreviewExample, PreviewConverseTaskOutput> => ({
  name: 'FirstPreviewNoError',
  kind: 'CODE',
  evaluate: async ({ output }) => {
    const previewCalls = getPreviewToolCalls(output);
    if (previewCalls.length === 0) {
      return { score: 0, metadata: { reason: 'No preview calls' } };
    }
    const firstResults = previewCalls[0].results ?? [];
    const errored = firstResults.some((result) => result.type === 'error');
    return { score: errored ? 0 : 1, metadata: { firstResultTypes: firstResults.map((r) => r.type) } };
  },
});

const createRenderAttachmentEvaluator = (): Evaluator<PreviewExample, PreviewConverseTaskOutput> => ({
  name: 'RenderAttachment',
  kind: 'CODE',
  evaluate: async ({ output }) => {
    const rendered = output.message.includes('<render_attachment');
    const renderedPreview = output.message.includes(PREVIEW_ATTACHMENT_PREFIX);
    return {
      score: rendered && renderedPreview ? 1 : 0,
      metadata: { rendered, renderedPreview },
    };
  },
});

const buildTask =
  ({
    chatClient,
    esClient,
  }: {
    chatClient: DetectionRulePreviewChatClient;
    esClient: EsClient;
  }): ExperimentTask<PreviewExample, PreviewConverseTaskOutput> =>
  async ({ input }) => {
    const response = await chatClient.converse(input.prompt, input.connectorId);
    const previewIds = extractPreviewIds(response.steps);
    const previewAlertCounts: number[] = [];
    for (const previewId of previewIds) {
      previewAlertCounts.push(await countPreviewAlerts(esClient, previewId));
    }
    return {
      steps: response.steps,
      message: response.message,
      previewIds,
      previewAlertCounts,
    };
  };

export const createEvaluatePreviewDataset =
  ({
    evaluators,
    executorClient,
    chatClient,
    esClient,
    log,
  }: {
    evaluators: DefaultEvaluators;
    executorClient: EvalsExecutorClient;
    chatClient: DetectionRulePreviewChatClient;
    esClient: EsClient;
    log: ToolingLog;
  }) =>
  async ({ dataset }: { dataset: EvaluationDataset<PreviewExample, null> }) => {
    const traceEvaluators = evaluators.traceBasedEvaluators;
    const suiteEvaluators: Array<Evaluator<PreviewExample, PreviewConverseTaskOutput>> = [
      createSkillInvokedEvaluator(),
      createRunRulePreviewEvaluator(),
      createPreviewUsesCommandEvaluator(),
      createFirstPreviewNoErrorEvaluator(),
      createPreviewAlertCountEvaluator(),
      createRenderAttachmentEvaluator(),
      traceEvaluators.toolCalls as Evaluator<PreviewExample, PreviewConverseTaskOutput>,
      traceEvaluators.latency as Evaluator<PreviewExample, PreviewConverseTaskOutput>,
      traceEvaluators.inputTokens as Evaluator<PreviewExample, PreviewConverseTaskOutput>,
      traceEvaluators.outputTokens as Evaluator<PreviewExample, PreviewConverseTaskOutput>,
    ];

    log.info(`Running detection-rule-preview matrix (${dataset.examples.length} cases)`);
    await executorClient.runExperiment(
      { datasets: [dataset], task: buildTask({ chatClient, esClient }) },
      suiteEvaluators
    );
  };
