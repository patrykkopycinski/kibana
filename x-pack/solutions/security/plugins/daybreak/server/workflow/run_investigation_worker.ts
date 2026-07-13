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

import INVESTIGATION_WORKER_YAML from './investigation_worker.yaml';
import { collectStepLogs } from './run_spike_workflow';

/** Stable ID for the investigation enrichment worker workflow definition. */
const INVESTIGATION_WORKER_ID = 'daybreak-investigation-worker';

/** The engine entry-point type, derived from the published start contract. */
type ExecuteWorkflowFn = WorkflowsExecutionEnginePluginStart['executeWorkflow'];

/** Return type of {@link ExecuteWorkflowFn} — the execution response. */
type ExecuteWorkflowResult = Awaited<ReturnType<ExecuteWorkflowFn>>;

export interface RunInvestigationWorkerParams {
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
  enabled?: boolean;
  investigationId: string;
}

/**
 * Parse and validate the investigation enrichment worker workflow YAML against
 * the engine's schema.
 */
export const getInvestigationWorkerWorkflow = () => {
  const parsed = parse(INVESTIGATION_WORKER_YAML);
  return WorkflowSchema.parse(parsed);
};

/**
 * Trigger the investigation enrichment worker workflow once end-to-end through
 * the existing engine entry point `executeWorkflow`.
 */
export const runInvestigationWorker = async ({
  executeWorkflow,
  logger,
  request,
  enabled,
  investigationId,
}: RunInvestigationWorkerParams): Promise<ExecuteWorkflowResult> => {
  const workflow = getInvestigationWorkerWorkflow();

  const stepLogs = collectStepLogs(workflow.steps);
  for (const entry of stepLogs) {
    logger.info(
      `daybreak investigation worker step input — [${entry.name}] type=${
        entry.type
      } input=${JSON.stringify(entry.input)}`
    );
  }

  const executableWorkflow = enabled === undefined ? workflow : { ...workflow, enabled };
  const executableYaml =
    enabled === undefined
      ? INVESTIGATION_WORKER_YAML
      : INVESTIGATION_WORKER_YAML.replace('enabled: false', 'enabled: true');

  const model = toWorkflowExecutionEngineModel(
    {
      id: INVESTIGATION_WORKER_ID,
      name: executableWorkflow.name,
      enabled: executableWorkflow.enabled,
      yaml: executableYaml,
      definition: executableWorkflow,
    },
    { isEphemeral: true }
  );

  const result = await executeWorkflow(model, { inputs: { investigationId } }, request);

  logger.info(
    `daybreak investigation worker executed — workflowExecutionId=${result.workflowExecutionId}, investigationId=${investigationId}`
  );

  return result;
};
