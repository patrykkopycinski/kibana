/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger, KibanaRequest, RouteSecurity } from '@kbn/core/server';
import type { IWorkflowEventLoggerService } from '@kbn/workflows-execution-engine/server';
import type { ExecuteSkillBoundedToolOptions } from '../workflow/execute_skill_bounded_tool';

export const daybreakRouteSecurity: RouteSecurity = {
  authz: {
    enabled: false,
    reason:
      'Daybreak is an experimental plugin behind a default-off flag; the Kibana-owned stores are accessed via the internal ES user.',
  },
};

export interface RouteDependencies {
  router: IRouter;
  logger: Logger;
  getSpaceId: (request: KibanaRequest) => string;
  executeAlertAnalysisWorker?: (
    request: KibanaRequest,
    params?: { rowId?: string; alertId?: string }
  ) => Promise<string>;
  executeInvestigationWorker?: (
    request: KibanaRequest,
    params: { investigationId: string }
  ) => Promise<string>;
  executeResponseActionWorker?: (
    request: KibanaRequest,
    params: { proposalId: string; action?: 'get_processes' | 'isolate'; hostName?: string }
  ) => Promise<string>;
  executeForensicWorker?: (
    request: KibanaRequest,
    params: { investigationId: string; hosts?: string[]; timeWindowHours?: number }
  ) => Promise<string>;
  executeSkillBoundedTool?: (
    request: KibanaRequest,
    params: { skillId: string; toolId: string; toolParams: Record<string, unknown> },
    options?: ExecuteSkillBoundedToolOptions
  ) => Promise<unknown>;
  workflowEventLoggerService?: IWorkflowEventLoggerService;
}
