/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface CreateRuleParams {
  name: string;
  ruleTypeId: string;
  params: Record<string, any>;
  consumer: string;
  actions?: Array<{
    id: string;
    group: string;
    params: Record<string, any>;
    frequency?: {
      summary: boolean;
      notifyWhen: string;
      throttle?: string;
    };
  }>;
  tags?: string[];
  schedule?: {
    interval: string;
  };
  enabled?: boolean;
  notifyWhen?: string;
  throttle?: string;
}
export interface CreateConnectorParams {
  name: string;
  connectorTypeId: string;
  config?: Record<string, any>;
  secrets?: Record<string, any>;
}
export interface UpdateRuleParams {
  name?: string;
  params?: Record<string, any>;
  actions?: Array<{
    id: string;
    group: string;
    params: Record<string, any>;
    frequency?: {
      summary: boolean;
      notifyWhen: string;
      throttle?: string;
    };
  }>;
  tags?: string[];
  schedule?: {
    interval: string;
  };
  throttle?: string;
  notifyWhen?: string;
}
export interface RequestOptions {
  ignoreErrors?: number[];
}
export interface UpdateFlappingSettingsParams {
  enabled: boolean;
  lookBackWindow: number;
  statusChangeThreshold: number;
}
export interface UpdateQueryDelaySettingsParams {
  delay: number;
}
export interface ScheduleSnoozeParams {
  duration?: number;
  id?: string;
  start?: Date | string;
  tzid?: string;
}
export interface AlertingApiService {
  rules: {
    create: (params: CreateRuleParams, spaceId?: string) => Promise<any>;
    get: (ruleId: string, spaceId?: string, options?: RequestOptions) => Promise<any>;
    update: (ruleId: string, updates: UpdateRuleParams, spaceId?: string) => Promise<any>;
    delete: (ruleId: string, spaceId?: string) => Promise<void>;
    find: (searchParams?: Record<string, any>, spaceId?: string) => Promise<any>;
    enable: (ruleId: string, spaceId?: string) => Promise<void>;
    disable: (ruleId: string, spaceId?: string) => Promise<void>;
    muteAll: (ruleId: string, spaceId?: string) => Promise<void>;
    unmuteAll: (ruleId: string, spaceId?: string) => Promise<void>;
    muteAlert: (ruleId: string, alertId: string, spaceId?: string) => Promise<void>;
    unmuteAlert: (ruleId: string, alertId: string, spaceId?: string) => Promise<void>;
    snooze: (ruleId: string, duration: number, spaceId?: string) => Promise<any>;
    scheduleSnooze: (
      ruleId: string,
      params?: ScheduleSnoozeParams,
      spaceId?: string
    ) => Promise<any>;
    unsnooze: (ruleId: string, scheduleIds?: string[], spaceId?: string) => Promise<any>;
    runSoon: (ruleId: string, spaceId?: string) => Promise<void>;
    getRuleTypes: (spaceId?: string) => Promise<any>;
    getExecutionLog: (ruleId: string, spaceId?: string) => Promise<any>;
    getHealth: () => Promise<any>;
  };
  connectors: {
    create: (params: CreateConnectorParams, spaceId?: string) => Promise<any>;
    get: (connectorId: string, spaceId?: string) => Promise<any>;
    update: (
      connectorId: string,
      updates: Partial<CreateConnectorParams>,
      spaceId?: string
    ) => Promise<any>;
    delete: (connectorId: string, spaceId?: string) => Promise<void>;
    getAll: (spaceId?: string) => Promise<any>;
    getTypes: (spaceId?: string) => Promise<any>;
    execute: (connectorId: string, params: Record<string, any>, spaceId?: string) => Promise<any>;
  };
  settings: {
    updateFlapping: (params: UpdateFlappingSettingsParams, spaceId?: string) => Promise<any>;
    updateQueryDelay: (params: UpdateQueryDelaySettingsParams, spaceId?: string) => Promise<any>;
    reset: (spaceId?: string) => Promise<void>;
  };
  waiting: {
    waitForRuleStatus: (
      ruleId: string,
      expectedStatus: string,
      spaceId?: string,
      timeoutMs?: number
    ) => Promise<string>;
    waitForAlertInIndex: (indexName: string, ruleId: string, timeoutMs?: number) => Promise<any>;
    waitForExecutionCount: (
      ruleId: string,
      count: number,
      spaceId?: string,
      timeoutMs?: number,
      dateStart?: Date
    ) => Promise<void>;
    waitForNextExecution: (
      ruleId: string,
      spaceId?: string,
      timeoutMs?: number,
      dateStart?: Date
    ) => Promise<void>;
  };
  cleanup: {
    deleteAllRules: (spaceId?: string) => Promise<void>;
    deleteAllConnectors: (spaceId?: string) => Promise<void>;
    deleteRulesByTags: (tags: string[], spaceId?: string) => Promise<void>;
  };
}
export declare const getAlertingApiHelper: (
  log: ScoutLogger,
  kbnClient: KbnClient
) => AlertingApiService;
