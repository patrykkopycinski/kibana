/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type {
  SidebarAppConfig,
  SidebarAppDefinition,
  SidebarAppId,
  SidebarAppUpdater,
  SidebarAppStatus,
} from '@kbn/core-chrome-sidebar';
export declare class SidebarRegistryService {
  private readonly registeredApps;
  private readonly changed$;
  registerApp<TState = undefined, TActions = undefined>(
    app: SidebarAppConfig<TState, TActions>
  ): SidebarAppUpdater;
  getApp(appId: SidebarAppId): SidebarAppDefinition;
  hasApp(appId: SidebarAppId): boolean;
  private setStatus;
  getStatus$(appId: SidebarAppId): Observable<SidebarAppStatus>;
  isOpenable(appId: SidebarAppId): boolean;
  isRestorable(appId: SidebarAppId): boolean;
}
