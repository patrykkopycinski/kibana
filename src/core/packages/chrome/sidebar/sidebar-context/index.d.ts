/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type ReactNode } from 'react';
import type { SidebarStart } from '@kbn/core-chrome-sidebar';
interface SidebarContextValue {
  sidebar: SidebarStart;
}
export interface SidebarProviderProps {
  children: ReactNode;
  value: SidebarContextValue;
}
export declare function SidebarServiceProvider({
  children,
  value,
}: SidebarProviderProps): React.JSX.Element;
/**
 * @internal
 */
export declare function useSidebarService(): SidebarStart;
/** Context for the sidebar panel, shared with consumer components */
export interface SidebarPanelContextValue {
  /** ID to place on the panel's heading element for aria-labelledby */
  headingId: string;
  /** Override focus target when the panel unmounts with focus inside. Defaults to main content. */
  setOnFocusRescue: (callback: (() => void) | undefined) => void;
}
export declare const SidebarPanelContext: React.Context<SidebarPanelContextValue | null>;
/** Hook for consumer components to access the sidebar panel context. Throws outside SidebarPanel. */
export declare const useSidebarPanel: () => SidebarPanelContextValue;
export {};
