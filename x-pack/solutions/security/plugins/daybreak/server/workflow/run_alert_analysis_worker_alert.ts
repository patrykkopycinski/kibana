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

import ALERT_ANALYSIS_WORKER_ALERT_YAML from './alert_analysis_worker_alert.yaml';
import { collectStepLogs } from './run_spike_workflow';
import { daybreakGoldenDataset } from '../evals/golden_dataset';

const ALERT_ANALYSIS_WORKER_ALERT_ID = 'daybreak-alert-analysis-worker-alert';

type ExecuteWorkflowFn = WorkflowsExecutionEnginePluginStart['executeWorkflow'];
type ExecuteWorkflowResult = Awaited<ReturnType<ExecuteWorkflowFn>>;

export interface RunAlertAnalysisWorkerAlertParams {
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
  enabled?: boolean;
  /** Alert document id from the trigger event (event.alerts[0]._id). */
  alertId?: string;
}

export const getAlertAnalysisWorkerAlertWorkflow = () => {
  const parsed = parse(ALERT_ANALYSIS_WORKER_ALERT_YAML);
  return WorkflowSchema.parse(parsed);
};

/** Build a minimal alert-trigger event for manual smoke of the alert variant. */
export const buildSyntheticAlertEvent = (alertId: string) => ({
  alerts: [
    {
      _id: alertId,
      _index: '.alerts-security.alerts-default',
      kibana: { alert: {} },
      '@timestamp': new Date().toISOString(),
    },
  ],
  rule: {
    id: 'daybreak-smoke-rule',
    name: 'Daybreak alert-analysis smoke',
    tags: [],
    consumer: 'securitySolution',
    producer: 'siem',
    ruleTypeId: 'siem.eqlRule',
  },
  params: {},
  spaceId: 'default',
});

export const runAlertAnalysisWorkerAlert = async ({
  executeWorkflow,
  logger,
  request,
  enabled,
  alertId,
}: RunAlertAnalysisWorkerAlertParams): Promise<ExecuteWorkflowResult> => {
  const workflow = getAlertAnalysisWorkerAlertWorkflow();

  const stepLogs = collectStepLogs(workflow.steps);
  for (const entry of stepLogs) {
    logger.info(
      `daybreak alert-trigger worker step input — [${entry.name}] type=${entry.type} input=${JSON.stringify(
        entry.input
      )}`
    );
  }

  const executableWorkflow = enabled === undefined ? workflow : { ...workflow, enabled };
  const executableYaml =
    enabled === undefined
      ? ALERT_ANALYSIS_WORKER_ALERT_YAML
      : ALERT_ANALYSIS_WORKER_ALERT_YAML.replace('enabled: false', 'enabled: true');

  const model = toWorkflowExecutionEngineModel(
    {
      id: ALERT_ANALYSIS_WORKER_ALERT_ID,
      name: executableWorkflow.name,
      enabled: executableWorkflow.enabled,
      yaml: executableYaml,
      definition: executableWorkflow,
    },
    { isEphemeral: true }
  );

  const resolvedAlertId =
    alertId ?? daybreakGoldenDataset.examples[0].input.alertEvidence.alertId;

  const result = await executeWorkflow(
    model,
    {
      inputs: {},
      event: buildSyntheticAlertEvent(resolvedAlertId),
    },
    request
  );

  logger.info(
    `daybreak alert-trigger worker executed — workflowExecutionId=${result.workflowExecutionId}, alertId=${resolvedAlertId}`
  );

  return result;
};
