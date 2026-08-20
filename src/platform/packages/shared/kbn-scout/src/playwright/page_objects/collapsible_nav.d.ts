/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from 'playwright/test';
import type { ScoutPage } from '..';
import type { ScoutTestConfig } from '../../types';
export declare class CollapsibleNav {
  private readonly page;
  private readonly config;
  private toggleNavButton;
  constructor(page: ScoutPage, config: ScoutTestConfig);
  expandNav(): Promise<void>;
  clickItem(
    itemName:
      | 'Discover'
      | 'Dashboards'
      | 'Maps'
      | 'Machine Learning'
      | 'stack_management'
      | 'management:maintenanceWindows',
    {
      lowercase,
    }?: {
      lowercase?: boolean;
    }
  ): Promise<void>;
  getNavLinks(): Promise<string[]>;
  openMoreMenu(): Promise<void>;
  clickNavItemByDeepLinkId(deepLinkId: string): Promise<void>;
  getNavItemById(id: string): Locator;
  getNavItemByDeepLinkId(deepLinkId: string): Locator;
}
