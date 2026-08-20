/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClient, ScoutLogger } from '../../../../../../common';
import type { CreatedDashboardPanel } from './types';
export type { CreatedDashboardPanel } from './types';
export { DASHBOARD_API_PATH, DASHBOARD_API_VERSION } from './constants';
/**
 * Dashboards API Service
 * Provides methods to interact with Kibana's Dashboards API
 */
export interface DashboardApiService {
  /**
   * Create a dashboard via the API and return its id.
   * @param body - Dashboard create request body
   * @param spaceId - Optional space id to create the dashboard in
   */
  create: (body: unknown, spaceId?: string) => Promise<string>;
  /**
   * Create a dashboard and fetch the auto-generated panel id of its first panel.
   * @param body - Dashboard create request body
   * @param spaceId - Optional space id to create the dashboard in
   */
  createWithPanelId: (body: unknown, spaceId?: string) => Promise<CreatedDashboardPanel>;
}
/**
 * Factory function to create a Dashboards API service helper
 * @param log - Scout logger instance
 * @param kbnClient - Kibana client for making API requests
 * @returns DashboardApiService instance
 */
export declare const getDashboardApiHelper: (
  log: ScoutLogger,
  kbnClient: KbnClient
) => DashboardApiService;
