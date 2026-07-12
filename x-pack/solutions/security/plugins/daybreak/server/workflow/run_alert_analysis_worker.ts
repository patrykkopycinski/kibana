/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import { WorkflowSchema, toWorkflowExecutionEngineModel } from '@kbn/workflows';

import ALERT_ANALYSIS_WORKER_YAML from './alert_analysis_worker.yaml';
import { collectStepLogs } from './run_spike_workflow';
import { daybreakGoldenDataset } from '../evals/golden_dataset';

/** Stable ID for the 5-phase alert-analysis worker workflow definition. */
const ALERT_ANALYSIS_WORKER_ID = 'daybreak-alert-analysis-worker';

/** The engine entry-point type, derived from the published start contract. */
type ExecuteWorkflowFn = WorkflowsExecutionEnginePluginStart['executeWorkflow'];

/** Return type of {@link ExecuteWorkflowFn} — the execution response. */
type ExecuteWorkflowResult = Awaited<ReturnType<ExecuteWorkflowFn>>;

export interface RunAlertAnalysisWorkerParams {
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
  enabled?: boolean;
  /** Optional golden-dataset row id; defaults to the first golden example. */
  rowId?: string;
}

/**
 * Parse and validate the 5-phase worker workflow YAML against the engine's
 * schema, returning a strongly-typed workflow definition (FR-006).
 *
 * The returned object conforms to the shipped {@link WorkflowYaml} schema,
 * proving the engine can express the Setup → Guard → Enrich → Reason → Act
 * step shape.
 */
export const getAlertAnalysisWorkerWorkflow = () => {
  const parsed = parse(ALERT_ANALYSIS_WORKER_YAML);
  return WorkflowSchema.parse(parsed);
};

/**
 * Trigger the 5-phase alert-analysis worker workflow once end-to-end through
 * the existing engine entry point `executeWorkflow` (FR-017), reusing the same
 * wrapper as PD-1's `runSpikeWorkflow` rather than replacing it.
 *
 * Each step's input is logged before invocation (via the shared
 * `collectStepLogs`) and the execution response is logged after, mirroring the
 * PD-1 runner's observability contract.
 *
 * @returns the execution response containing the workflow execution ID.
 */
export const runAlertAnalysisWorker = async ({
  executeWorkflow,
  logger,
  request,
  enabled,
  rowId,
}: RunAlertAnalysisWorkerParams): Promise<ExecuteWorkflowResult> => {
  const workflow = getAlertAnalysisWorkerWorkflow();

  const stepLogs = collectStepLogs(workflow.steps);
  for (const entry of stepLogs) {
    logger.info(
      `daybreak worker step input — [${entry.name}] type=${entry.type} input=${JSON.stringify(
        entry.input
      )}`
    );
  }

  const executableWorkflow = enabled === undefined ? workflow : { ...workflow, enabled };
  const executableYaml =
    enabled === undefined
      ? ALERT_ANALYSIS_WORKER_YAML
      : ALERT_ANALYSIS_WORKER_YAML.replace('enabled: false', 'enabled: true');

  const model = toWorkflowExecutionEngineModel(
    {
      id: ALERT_ANALYSIS_WORKER_ID,
      name: executableWorkflow.name,
      enabled: executableWorkflow.enabled,
      yaml: executableYaml,
      definition: executableWorkflow,
    },
    { isEphemeral: true }
  );

  const resolvedRowId = rowId ?? daybreakGoldenDataset.examples[0].id;
  const result = await executeWorkflow(model, { inputs: { rowId: resolvedRowId } }, request);

  logger.info(
    `daybreak worker workflow executed — workflowExecutionId=${result.workflowExecutionId}, rowId=${resolvedRowId}`
  );

  return result;
};
