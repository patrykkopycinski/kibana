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

import FORENSIC_WORKER_YAML from './forensic_worker.yaml';
import { collectStepLogs } from './run_spike_workflow';

const FORENSIC_WORKER_ID = 'daybreak-forensic-worker';

type ExecuteWorkflowFn = WorkflowsExecutionEnginePluginStart['executeWorkflow'];
type ExecuteWorkflowResult = Awaited<ReturnType<ExecuteWorkflowFn>>;

export interface RunForensicWorkerParams {
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
  enabled?: boolean;
  investigationId: string;
  hosts?: string[];
  timeWindowHours?: number;
}

export const getForensicWorkerWorkflow = () => {
  const parsed = parse(FORENSIC_WORKER_YAML);
  return WorkflowSchema.parse(parsed);
};

export const runForensicWorker = async ({
  executeWorkflow,
  logger,
  request,
  enabled,
  investigationId,
  hosts,
  timeWindowHours,
}: RunForensicWorkerParams): Promise<ExecuteWorkflowResult> => {
  const workflow = getForensicWorkerWorkflow();

  const stepLogs = collectStepLogs(workflow.steps);
  for (const entry of stepLogs) {
    logger.info(
      `daybreak forensic worker step input — [${entry.name}] type=${
        entry.type
      } input=${JSON.stringify(entry.input)}`
    );
  }

  const executableWorkflow = enabled === undefined ? workflow : { ...workflow, enabled };
  const executableYaml =
    enabled === undefined
      ? FORENSIC_WORKER_YAML
      : FORENSIC_WORKER_YAML.replace('enabled: false', 'enabled: true');

  const model = toWorkflowExecutionEngineModel(
    {
      id: FORENSIC_WORKER_ID,
      name: executableWorkflow.name,
      enabled: executableWorkflow.enabled,
      yaml: executableYaml,
      definition: executableWorkflow,
    },
    { isEphemeral: true }
  );

  const result = await executeWorkflow(
    model,
    {
      inputs: {
        investigationId,
        hosts: (hosts ?? []).join(','),
        timeWindowHours: timeWindowHours ?? 72,
      },
    },
    request
  );

  logger.info(
    `daybreak forensic worker executed — workflowExecutionId=${result.workflowExecutionId}, investigationId=${investigationId}`
  );

  return result;
};
