/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import { WorkflowSchema, toWorkflowExecutionEngineModel, type WorkflowYaml } from '@kbn/workflows';

import { collectStepLogs } from './run_spike_workflow';

/** Engine entry-point type from the published start contract. */
export type ExecuteWorkflowFn = WorkflowsExecutionEnginePluginStart['executeWorkflow'];

/** Return type of {@link ExecuteWorkflowFn}. */
export type ExecuteWorkflowResult = Awaited<ReturnType<ExecuteWorkflowFn>>;

export interface RunDaybreakWorkerParams {
  workerId: string;
  workflowYaml: string;
  /** Prefix for step-input and completion log lines (e.g. `daybreak worker`). */
  logLabel: string;
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
  enabled?: boolean;
  /** Workflow execution context; defaults to `{ inputs: {} }`. */
  context?: Record<string, unknown>;
  /** Completion log prefix; defaults to `logLabel` (alert-analysis uses `daybreak worker workflow`). */
  completionLogLabel?: string;
  /** Extra key=value pairs appended to the completion log line. */
  completionDetail?: string;
}

/** Parse and schema-validate a Daybreak worker YAML definition. */
export const parseDaybreakWorkerWorkflow = (workflowYaml: string): WorkflowYaml => {
  const parsed = parse(workflowYaml);
  return WorkflowSchema.parse(parsed);
};

/**
 * Shared ephemeral-worker runner: validate YAML, log step inputs, convert to an
 * engine model, and dispatch via `executeWorkflow`.
 */
export const runDaybreakWorker = async ({
  workerId,
  workflowYaml,
  logLabel,
  executeWorkflow,
  logger,
  request,
  enabled,
  context = { inputs: {} },
  completionLogLabel,
  completionDetail,
}: RunDaybreakWorkerParams): Promise<ExecuteWorkflowResult> => {
  const workflow = parseDaybreakWorkerWorkflow(workflowYaml);

  const stepLogs = collectStepLogs(workflow.steps);
  for (const entry of stepLogs) {
    logger.info(
      `${logLabel} step input — [${entry.name}] type=${entry.type} input=${JSON.stringify(
        entry.input
      )}`
    );
  }

  const executableWorkflow = enabled === undefined ? workflow : { ...workflow, enabled };
  const executableYaml =
    enabled === undefined
      ? workflowYaml
      : workflowYaml.replace('enabled: false', 'enabled: true');

  const model = toWorkflowExecutionEngineModel(
    {
      id: workerId,
      name: executableWorkflow.name,
      enabled: executableWorkflow.enabled,
      yaml: executableYaml,
      definition: executableWorkflow,
    },
    { isEphemeral: true }
  );

  const result = await executeWorkflow(model, context, request);

  const doneLabel = completionLogLabel ?? logLabel;
  logger.info(
    `${doneLabel} executed — workflowExecutionId=${result.workflowExecutionId}${
      completionDetail ? `, ${completionDetail}` : ''
    }`
  );

  return result;
};
