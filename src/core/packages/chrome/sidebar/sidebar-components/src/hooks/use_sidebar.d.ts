/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SidebarAppId, SidebarAppStatus } from '@kbn/core-chrome-sidebar';
/** Global sidebar state API */
export interface UseSidebarApi {
  isOpen: boolean;
  currentAppId: SidebarAppId | null;
  close: () => void;
  setWidth: (width: number) => void;
}
/** Hook for global sidebar state. For app-specific ops, use `useSidebarApp`. */
export declare function useSidebar(): UseSidebarApi;
/** Hook for sidebar width */
export declare function useSidebarWidth(): number;
/**
 * App-specific sidebar API with reactive state and actions.
 * For stateless apps, `state` and `actions` are undefined.
 */
export interface UseSidebarAppApi<TState = undefined, TActions = undefined> {
  /** Current state (reactive). Undefined for stateless apps. */
  state: TState;
  /** Bound actions to modify state. Undefined for stateless apps. */
  actions: TActions;
  /** Current app status (reactive) */
  status: SidebarAppStatus;
  /** Open sidebar to this app */
  open: () => void;
  /** Close sidebar */
  close: () => void;
}
/** Hook for app-specific sidebar actions and state */
export declare function useSidebarApp<TState = undefined, TActions = undefined>(
  appId: SidebarAppId
): UseSidebarAppApi<TState, TActions>;
