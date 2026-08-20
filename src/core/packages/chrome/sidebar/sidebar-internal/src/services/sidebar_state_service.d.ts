/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { SidebarAppId } from '@kbn/core-chrome-sidebar';
import type { SidebarRegistryService } from './sidebar_registry_service';
import type { StorageHelper } from './storage_helper';
export declare class SidebarStateService {
  private readonly registry;
  private readonly storage;
  private readonly currentAppId$;
  private readonly width$;
  constructor(registry: SidebarRegistryService, storage: StorageHelper);
  isOpen$(): Observable<boolean>;
  getWidth$(): Observable<number>;
  getCurrentAppId$(): Observable<SidebarAppId | null>;
  start(): void;
  private handleWindowResize;
  open(appId: SidebarAppId): void;
  close(): void;
  isOpen(): boolean;
  setWidth(width: number): void;
  getWidth(): number;
  getCurrentAppId(): SidebarAppId | null;
  stop(): void;
}
