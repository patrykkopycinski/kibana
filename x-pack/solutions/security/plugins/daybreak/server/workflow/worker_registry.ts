/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { getManagedWorkflowDefinition } from '@kbn/workflows/managed';
import {
  DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_ID,
  DAYBREAK_ALERT_ANALYSIS_WORKER_ID,
} from '@kbn/workflows/managed/definitions/daybreak';

import {
  parseDaybreakWorkerWorkflow,
  runDaybreakWorker,
  type ExecuteWorkflowFn,
  type ExecuteWorkflowResult,
} from './run_daybreak_worker';

export type { ExecuteWorkflowFn, ExecuteWorkflowResult } from './run_daybreak_worker';

/** Open worker id — built-ins use constants from @kbn/workflows/managed/definitions/daybreak. */
export type DaybreakWorkerId = string;

export type ResponseActionType = 'get_processes' | 'isolate';

export interface DaybreakWorkerParams {
  rowId?: string;
  alertId?: string;
  investigationId?: string;
  proposalId?: string;
  action?: ResponseActionType;
  hostName?: string;
  hosts?: string[];
  timeWindowHours?: number;
}

/**
 * Full worker contract for registerDaybreakWorker().
 * Built-in workers are declared in builtin_workers.ts and registered at module load.
 */
export interface DaybreakWorkerDefinition {
  id: DaybreakWorkerId;
  yaml: string;
  /**
   * When true, installDaybreakManagedWorkflows installs this id (requires a matching
   * ManagedWorkflowDefinition in @kbn/workflows/managed/definitions/daybreak).
   */
  installManaged?: boolean;
  logLabel: string;
  completionLogLabel?: string;
  buildContext: (params: DaybreakWorkerParams) => Record<string, unknown>;
  buildCompletionDetail: (params: DaybreakWorkerParams) => string;
}

/** Runtime registry entry stored in the worker Map. */
export interface DaybreakWorkerRegistryEntry {
  yaml: string;
  installManaged: boolean;
  logLabel: string;
  completionLogLabel?: string;
  buildContext: (params: DaybreakWorkerParams) => Record<string, unknown>;
  buildCompletionDetail: (params: DaybreakWorkerParams) => string;
}

const toRegistryEntry = (definition: DaybreakWorkerDefinition): DaybreakWorkerRegistryEntry => ({
  yaml: definition.yaml,
  installManaged: definition.installManaged ?? false,
  logLabel: definition.logLabel,
  completionLogLabel: definition.completionLogLabel,
  buildContext: definition.buildContext,
  buildCompletionDetail: definition.buildCompletionDetail,
});

const registry = new Map<DaybreakWorkerId, DaybreakWorkerRegistryEntry>();

/**
 * Register a Daybreak worker for runtime dispatch (and optional /app/workflows install).
 * Call from Daybreak modules at import time or via DaybreakPluginSetup.registerDaybreakWorker.
 */
export const registerDaybreakWorker = (definition: DaybreakWorkerDefinition): void => {
  if (registry.has(definition.id)) {
    throw new Error(`Daybreak worker already registered: ${definition.id}`);
  }
  if (definition.installManaged && !getManagedWorkflowDefinition(definition.id)) {
    throw new Error(
      `Daybreak worker '${definition.id}' requests installManaged but has no ManagedWorkflowDefinition in @kbn/workflows/managed`
    );
  }
  registry.set(definition.id, toRegistryEntry(definition));
};

/** Read-only view of registered workers (populated after builtin_workers loads). */
export const getDaybreakWorkerRegistry = (): ReadonlyMap<
  DaybreakWorkerId,
  DaybreakWorkerRegistryEntry
> => registry;

export const getRegisteredDaybreakWorkerIds = (): DaybreakWorkerId[] => [...registry.keys()];

/** Worker ids registered with installManaged that have a platform managed definition. */
export const getManagedInstallWorkerIds = (): DaybreakWorkerId[] =>
  getRegisteredDaybreakWorkerIds().filter((id) => {
    const entry = registry.get(id);
    return Boolean(entry?.installManaged && getManagedWorkflowDefinition(id));
  });

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

export const getWorkerWorkflowYaml = (workerId: DaybreakWorkerId): string => {
  const entry = registry.get(workerId);
  if (!entry) {
    throw new Error(`Unknown daybreak worker id: ${workerId}`);
  }
  return entry.yaml;
};

export const getWorkerWorkflow = (workerId: DaybreakWorkerId) =>
  parseDaybreakWorkerWorkflow(getWorkerWorkflowYaml(workerId));

export interface RunDaybreakWorkerByIdParams {
  workerId: DaybreakWorkerId;
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
  enabled?: boolean;
  params: DaybreakWorkerParams;
}

export const runDaybreakWorkerById = async ({
  workerId,
  executeWorkflow,
  logger,
  request,
  enabled,
  params,
}: RunDaybreakWorkerByIdParams): Promise<ExecuteWorkflowResult> => {
  const entry = registry.get(workerId);
  if (!entry) {
    throw new Error(`Unknown daybreak worker id: ${workerId}`);
  }

  return runDaybreakWorker({
    workerId,
    workflowYaml: entry.yaml,
    logLabel: entry.logLabel,
    completionLogLabel: entry.completionLogLabel,
    executeWorkflow,
    logger,
    request,
    enabled,
    context: entry.buildContext(params),
    completionDetail: entry.buildCompletionDetail(params),
  });
};

export const resolveAlertAnalysisWorkerId = (params: DaybreakWorkerParams): DaybreakWorkerId =>
  params.alertId ? DAYBREAK_ALERT_ANALYSIS_WORKER_ALERT_ID : DAYBREAK_ALERT_ANALYSIS_WORKER_ID;

