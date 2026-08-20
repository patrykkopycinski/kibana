/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type AppMenuBreakpointSource } from './app_menu_responsive';
export interface AppMenuLoadingProps {
  /**
   * App menu button placeholders on the left (overflow / secondary actions).
   * Defaults to 1. Clamped to {@link APP_MENU_ITEM_LIMIT}.
   */
  buttonCount?: number;
  /** Primary-action rectangle. Defaults to `true`. */
  hasPrimary?: boolean;
  breakpointSource?: AppMenuBreakpointSource;
}
/**
 * Loading placeholder for {@link AppMenuComponent}. Uses the same responsive layout
 * selection so collapsed / minimal / expanded breakpoints match the real menu.
 */
export declare const AppMenuLoading: ({
  buttonCount,
  hasPrimary,
  breakpointSource,
}: AppMenuLoadingProps) => React.ReactElement | null;
