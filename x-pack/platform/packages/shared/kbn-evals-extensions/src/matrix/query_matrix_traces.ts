/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvalsClient, EvaluationScoreDocument } from '@kbn/evals';
import type { AggregatedModelScores } from './query_matrix_scores';
import type { MatrixTraceData, MatrixTraceEntry, TraceStep } from './trace_types';
import { traceKey } from './trace_types';

/**
 * Extracts trace data (initial question, tool trail, agent answer, step trace)
 * from a single evaluation score document.
 *
 * Score documents store the full `task.output` which contains:
 * - `steps`: array of `{ type: "reasoning"|"tool_call"|"relevant_skills", ... }`
 * - `messages`: array of `{ message: string }` (the agent's final answer)
 * And `example.input.question` holds the initial user question.
 */
const extractTraceFromScore = (score: EvaluationScoreDocument): MatrixTraceEntry => {
  const question = (score.example?.input as { question?: string } | null)?.question;
  const taskOutput = score.task?.output as
    | {
        steps?: Array<Record<string, unknown>>;
        messages?: Array<{ message?: string }>;
      }
    | null
    | undefined;

  const steps: TraceStep[] = [];
  const toolTrail: string[] = [];

  for (const step of taskOutput?.steps ?? []) {
    const stepType = step.type as string | undefined;
    if (stepType === 'tool_call') {
      const toolId = step.tool_id as string | undefined;
      if (toolId) {
        toolTrail.push(toolId);
      }
      steps.push({
        type: 'tool',
        toolId,
        toolParams: step.args ? JSON.stringify(step.args).slice(0, 300) : undefined,
      });
    } else if (stepType === 'reasoning') {
      steps.push({
        type: 'reasoning',
        text: (step.reasoning as string | undefined)?.slice(0, 500),
      });
    } else if (stepType === 'relevant_skills') {
      const skills = Array.isArray(step.skills)
        ? (step.skills as Array<{ id?: string }>).map((s) => s.id).filter(Boolean)
        : undefined;
      steps.push({ type: 'skill', skills });
    }
  }

  // The final answer is the last non-empty message
  let answer: string | undefined;
  for (const msg of taskOutput?.messages ?? []) {
    const content = msg.message;
    if (content && content.length > 50) {
      answer = content;
    }
  }

  return {
    question,
    toolTrail: toolTrail.length > 0 ? toolTrail : undefined,
    answer: answer || undefined,
    steps: steps.length > 0 ? steps : undefined,
    stepCount: steps.length,
    toolCount: toolTrail.length,
  };
};

/**
 * Queries evaluation score documents from the golden cluster via the evals
 * plugin and extracts trace data (initial question, tool trail, agent answer,
 * step trace) for each (model, column) pair.
 *
 * Uses the same experiment IDs resolved by `queryMatrixScores` to fetch the
 * full score documents — which include `task.output.steps` and
 * `example.input.question` — and maps them into `MatrixTraceData`.
 */
export const queryMatrixTraces = async (
  evalsClient: EvalsClient,
  log: SomeDevLog,
  aggregated: AggregatedModelScores[]
): Promise<MatrixTraceData> => {
  const traces: MatrixTraceData = {};

  for (const modelScores of aggregated) {
    for (const suite of modelScores.suites) {
      const experimentId = suite.experimentId;
      log.debug(
        `Fetching score documents for experiment ${experimentId} (model ${modelScores.modelId})`
      );

      const scores = await evalsClient.getExperimentScores(experimentId, {
        suiteId: suite.suiteId,
        taskModelId: modelScores.modelId,
        executionId: experimentId,
      });

      for (const score of scores) {
        const entry = extractTraceFromScore(score);
        const datasetId = score.example?.dataset?.id;
        const exampleId = score.example?.id;

        // Key by model:exampleId — the caller maps example IDs to column IDs
        // via the suite/dataset config. We also key by model:suiteId as a
        // fallback for column-level lookups.
        if (exampleId) {
          traces[traceKey(modelScores.modelId, exampleId)] = entry;
        }
        if (datasetId) {
          traces[traceKey(modelScores.modelId, datasetId)] = entry;
        }
        // Also key by suiteId for column-level lookups
        traces[traceKey(modelScores.modelId, suite.suiteId)] = entry;
      }
    }
  }

  log.debug(`Matrix traces resolved ${Object.keys(traces).length} trace entries`);
  return traces;
};
