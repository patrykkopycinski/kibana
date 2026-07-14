/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_ID,
  DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_YAML,
  DAYBREAK_ALERT_ANALYSIS_WORKER_ID,
  DAYBREAK_ALERT_ANALYSIS_WORKER_YAML,
  DAYBREAK_FORENSIC_WORKER_ID,
  DAYBREAK_FORENSIC_WORKER_YAML,
  DAYBREAK_INVESTIGATION_WORKER_ID,
  DAYBREAK_INVESTIGATION_WORKER_YAML,
  DAYBREAK_MANAGED_WORKFLOW_IDS,
  DAYBREAK_RESPONSE_ACTION_WORKER_ID,
  DAYBREAK_RESPONSE_ACTION_WORKER_YAML,
} from '@kbn/workflows/managed/definitions/daybreak';

import { daybreakGoldenDataset } from '../evals/golden_dataset';
import {
  buildSyntheticAlertEvent,
  registerDaybreakWorker,
  type DaybreakWorkerDefinition,
} from './worker_registry';

/**
 * Canonical built-in worker definitions — drives runtime registry and managed install.
 * YAML + managed metadata remain in @kbn/workflows/managed/definitions/daybreak;
 * this array adds runtime dispatch (buildContext) and links installManaged to those ids.
 */
export const DAYBREAK_BUILTIN_WORKER_DEFINITIONS: DaybreakWorkerDefinition[] = [
  {
    id: DAYBREAK_ALERT_ANALYSIS_WORKER_ID,
    yaml: DAYBREAK_ALERT_ANALYSIS_WORKER_YAML,
    installManaged: true,
    logLabel: 'daybreak worker',
    completionLogLabel: 'daybreak worker workflow',
    buildContext: (params) => ({
      inputs: { rowId: params.rowId ?? daybreakGoldenDataset.examples[0].id },
    }),
    buildCompletionDetail: (params) =>
      `rowId=${params.rowId ?? daybreakGoldenDataset.examples[0].id}`,
  },
  {
    id: DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_ID,
    yaml: DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_YAML,
    installManaged: true,
    logLabel: 'daybreak alert-trigger worker',
    buildContext: (params) => {
      const alertId =
        params.alertId ?? daybreakGoldenDataset.examples[0].input.alertEvidence.alertId;
      return {
        inputs: {},
        event: buildSyntheticAlertEvent(alertId),
      };
    },
    buildCompletionDetail: (params) => {
      const alertId =
        params.alertId ?? daybreakGoldenDataset.examples[0].input.alertEvidence.alertId;
      return `alertId=${alertId}`;
    },
  },
  {
    id: DAYBREAK_INVESTIGATION_WORKER_ID,
    yaml: DAYBREAK_INVESTIGATION_WORKER_YAML,
    installManaged: true,
    logLabel: 'daybreak investigation worker',
    buildContext: (params) => ({ inputs: { investigationId: params.investigationId } }),
    buildCompletionDetail: (params) => `investigationId=${params.investigationId}`,
  },
  {
    id: DAYBREAK_RESPONSE_ACTION_WORKER_ID,
    yaml: DAYBREAK_RESPONSE_ACTION_WORKER_YAML,
    installManaged: true,
    logLabel: 'daybreak response-action worker',
    buildContext: (params) => ({
      inputs: {
        proposalId: params.proposalId,
        action: params.action ?? 'get_processes',
        hostName: params.hostName ?? '',
      },
    }),
    buildCompletionDetail: (params) =>
      `proposalId=${params.proposalId}, action=${params.action ?? 'get_processes'}`,
  },
  {
    id: DAYBREAK_FORENSIC_WORKER_ID,
    yaml: DAYBREAK_FORENSIC_WORKER_YAML,
    installManaged: true,
    logLabel: 'daybreak forensic worker',
    buildContext: (params) => ({
      inputs: {
        investigationId: params.investigationId,
        hosts: (params.hosts ?? []).join(','),
        timeWindowHours: params.timeWindowHours ?? 72,
      },
    }),
    buildCompletionDetail: (params) => `investigationId=${params.investigationId}`,
  },
];

let builtinWorkersRegistered = false;

/** Register built-in workers once (called from DaybreakPlugin.setup). */
export const registerBuiltinDaybreakWorkers = (): void => {
  if (builtinWorkersRegistered) {
    return;
  }
  for (const definition of DAYBREAK_BUILTIN_WORKER_DEFINITIONS) {
    registerDaybreakWorker(definition);
  }
  if (DAYBREAK_BUILTIN_WORKER_DEFINITIONS.length !== DAYBREAK_MANAGED_WORKFLOW_IDS.length) {
    throw new Error(
      `DAYBREAK_BUILTIN_WORKER_DEFINITIONS (${DAYBREAK_BUILTIN_WORKER_DEFINITIONS.length}) must match DAYBREAK_MANAGED_WORKFLOW_IDS (${DAYBREAK_MANAGED_WORKFLOW_IDS.length})`
    );
  }
  builtinWorkersRegistered = true;
};
