/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { AppMenuConfig, AppMenuStaticItem } from '../types';
import { type AppMenuBreakpointSource } from './app_menu_responsive';
export type { AppMenuBreakpointSource };
export interface AppMenuItemsProps {
  config?: AppMenuConfig;
  visible?: boolean;
  breakpointSource?: AppMenuBreakpointSource;
  /**
   * Static items that always appear at the end of the overflow menu.
   */
  staticItems?: AppMenuStaticItem[];
}
export declare const AppMenuComponent: ({
  config,
  visible,
  breakpointSource,
  staticItems,
}: AppMenuItemsProps) => React.JSX.Element | null;
