/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import { toWorkflowExecutionEngineModel, type WorkflowYaml } from '@kbn/workflows';

import { ALERT_ANALYSIS_WORKFLOW_YAML, getAlertAnalysisWorkflow } from './alert_analysis_workflow';

/** Stable ID for the ephemeral spike workflow definition. */
const SPIKE_WORKFLOW_ID = 'daybreak-alert-analysis-spike';

/** The engine entry-point type, derived from the published start contract. */
type ExecuteWorkflowFn = WorkflowsExecutionEnginePluginStart['executeWorkflow'];

/** Return type of {@link ExecuteWorkflowFn} — the execution response. */
type ExecuteWorkflowResult = Awaited<ReturnType<ExecuteWorkflowFn>>;

export interface RunSpikeWorkflowParams {
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
}

/** A flattened representation of a workflow step for logging (FR-009). */
export interface SpikeStepLogEntry {
  name: string;
  type: string;
  input: unknown;
}

/**
 * Collect each step's definition (and nested steps) for pre-execution logging
 * (FR-009 — step inputs).
 *
 * Handles the union {@link Step} type by reading `name`, `type`, and any
 * `with` / `condition` fields that are present.
 */
export const collectStepLogs = (steps: WorkflowYaml['steps']): SpikeStepLogEntry[] =>
  steps.flatMap((step) => {
    const entries: SpikeStepLogEntry[] = [
      {
        name: step.name,
        type: step.type,
        input: 'with' in step ? step.with : 'condition' in step ? step.condition : undefined,
      },
    ];

    if ('steps' in step && Array.isArray(step.steps)) {
      entries.push(...collectStepLogs(step.steps as WorkflowYaml['steps']));
    }

    return entries;
  });

/**
 * Trigger the spike workflow once end-to-end through the existing engine entry
 * point `executeWorkflow` (FR-008, FR-010), logging each step's input before
 * invocation and the execution response after (FR-009).
 *
 * The runner writes no new engine code — it consumes the
 * `workflowsExecutionEngine.executeWorkflow` start-contract method and the
 * `toWorkflowExecutionEngineModel` converter from `@kbn/workflows`.
 *
 * @returns the execution response containing the workflow execution ID.
 */
export const runSpikeWorkflow = async ({
  executeWorkflow,
  logger,
  request,
}: RunSpikeWorkflowParams): Promise<ExecuteWorkflowResult> => {
  const workflow = getAlertAnalysisWorkflow();

  // FR-009 — log each step's input before execution
  const stepLogs = collectStepLogs(workflow.steps);
  for (const entry of stepLogs) {
    logger.info(
      `daybreak spike step input — [${entry.name}] type=${entry.type} input=${JSON.stringify(
        entry.input
      )}`
    );
  }

  const model = toWorkflowExecutionEngineModel({
    id: SPIKE_WORKFLOW_ID,
    name: workflow.name,
    enabled: workflow.enabled,
    yaml: ALERT_ANALYSIS_WORKFLOW_YAML,
    definition: workflow,
  });

  // FR-008 + FR-010 — trigger through the existing engine entry point
  const result = await executeWorkflow(model, {}, request);

  // FR-009 — log the execution output
  logger.info(
    `daybreak spike workflow executed — workflowExecutionId=${result.workflowExecutionId}`
  );

  return result;
};
