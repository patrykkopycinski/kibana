/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { SidebarStoreConfig, SidebarContext } from '@kbn/core-chrome-sidebar';
/** Minimal storage interface for sidebar stores */
export interface SidebarStorage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
}
/** Live store instance - holds state and bound actions */
export interface LiveStore<TState, TActions> {
  getState: () => TState;
  getState$: () => Observable<TState>;
  actions: TActions;
}
/**
 * Create a live store instance from a store configuration.
 * Handles storage restore, Zod validation, BehaviorSubject creation, and action binding.
 */
export declare function createLiveStore<TState, TActions>(
  appId: string,
  config: SidebarStoreConfig<TState, TActions>,
  storage: SidebarStorage,
  context: SidebarContext
): LiveStore<TState, TActions>;
