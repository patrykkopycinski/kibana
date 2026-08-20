/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SidebarSetup, SidebarStart } from '@kbn/core-chrome-sidebar';
import type { SidebarRegistryService } from './sidebar_registry_service';
import type { SidebarStateService } from './sidebar_state_service';
/** Composite service for sidebar: registry, UI state, and app state */
export declare class SidebarService {
  readonly registry: SidebarRegistryService;
  readonly state: SidebarStateService;
  private readonly storage;
  constructor(params: { basePath: string });
  setup(): SidebarSetup;
  start(): SidebarStart;
  stop(): void;
  private getApp;
}
