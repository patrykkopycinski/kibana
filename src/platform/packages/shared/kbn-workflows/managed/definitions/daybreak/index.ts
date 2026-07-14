/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import ALERT_ANALYSIS_WORKER_BODY_YAML from './alert_analysis_worker.yaml';
import ALERT_ANALYSIS_WORKER_ALERT_BODY_YAML from './alert_analysis_worker_alert.yaml';
import INVESTIGATION_WORKER_BODY_YAML from './investigation_worker.yaml';
import RESPONSE_ACTION_WORKER_BODY_YAML from './response_action_worker.yaml';
import FORENSIC_WORKER_BODY_YAML from './forensic_worker.yaml';
import { composeWorkerYaml } from './compose_worker_yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID = 'daybreak';

export const DAYBREAK_ALERT_ANALYSIS_WORKER_ID = 'daybreak-alert-analysis-worker';
export const DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_ID = 'daybreak-alert-analysis-worker-alert';
export const DAYBREAK_INVESTIGATION_WORKER_ID = 'daybreak-investigation-worker';
export const DAYBREAK_RESPONSE_ACTION_WORKER_ID = 'daybreak-response-action-worker';
export const DAYBREAK_FORENSIC_WORKER_ID = 'daybreak-forensic-worker';

export const DAYBREAK_MANAGED_WORKFLOW_IDS = [
  DAYBREAK_ALERT_ANALYSIS_WORKER_ID,
  DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_ID,
  DAYBREAK_INVESTIGATION_WORKER_ID,
  DAYBREAK_RESPONSE_ACTION_WORKER_ID,
  DAYBREAK_FORENSIC_WORKER_ID,
] as const;

export type DaybreakManagedWorkflowId = (typeof DAYBREAK_MANAGED_WORKFLOW_IDS)[number];

export const DAYBREAK_ALERT_ANALYSIS_WORKER_YAML = composeWorkerYaml(ALERT_ANALYSIS_WORKER_BODY_YAML);
export const DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_YAML = composeWorkerYaml(
  ALERT_ANALYSIS_WORKER_ALERT_BODY_YAML
);
export const DAYBREAK_INVESTIGATION_WORKER_YAML = composeWorkerYaml(INVESTIGATION_WORKER_BODY_YAML);
export const DAYBREAK_RESPONSE_ACTION_WORKER_YAML = composeWorkerYaml(RESPONSE_ACTION_WORKER_BODY_YAML);
export const DAYBREAK_FORENSIC_WORKER_YAML = composeWorkerYaml(FORENSIC_WORKER_BODY_YAML);

const DAYBREAK_MANAGED_WORKFLOW_MANAGEMENT = {
  lifecycle: 'static',
  versionStrategy: 'auto',
  enablement: 'restorable',
} as const;

export const DAYBREAK_ALERT_ANALYSIS_WORKER = {
  id: DAYBREAK_ALERT_ANALYSIS_WORKER_ID,
  pluginId: DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 1,
  billable: false,
  visibility: { solutions: ['security'] },
  yaml: DAYBREAK_ALERT_ANALYSIS_WORKER_YAML,
  management: DAYBREAK_MANAGED_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT = {
  id: DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_ID,
  pluginId: DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 1,
  billable: false,
  visibility: { solutions: ['security'] },
  yaml: DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_YAML,
  management: DAYBREAK_MANAGED_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const DAYBREAK_INVESTIGATION_WORKER = {
  id: DAYBREAK_INVESTIGATION_WORKER_ID,
  pluginId: DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 1,
  billable: false,
  visibility: { solutions: ['security'] },
  yaml: DAYBREAK_INVESTIGATION_WORKER_YAML,
  management: DAYBREAK_MANAGED_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const DAYBREAK_RESPONSE_ACTION_WORKER = {
  id: DAYBREAK_RESPONSE_ACTION_WORKER_ID,
  pluginId: DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 1,
  billable: false,
  visibility: { solutions: ['security'] },
  yaml: DAYBREAK_RESPONSE_ACTION_WORKER_YAML,
  management: DAYBREAK_MANAGED_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const DAYBREAK_FORENSIC_WORKER = {
  id: DAYBREAK_FORENSIC_WORKER_ID,
  pluginId: DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 1,
  billable: false,
  visibility: { solutions: ['security'] },
  yaml: DAYBREAK_FORENSIC_WORKER_YAML,
  management: DAYBREAK_MANAGED_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const DAYBREAK_MANAGED_WORKFLOWS = [
  DAYBREAK_ALERT_ANALYSIS_WORKER,
  DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT,
  DAYBREAK_INVESTIGATION_WORKER,
  DAYBREAK_RESPONSE_ACTION_WORKER,
  DAYBREAK_FORENSIC_WORKER,
] as const;

export { composeWorkerYaml } from './compose_worker_yaml';
