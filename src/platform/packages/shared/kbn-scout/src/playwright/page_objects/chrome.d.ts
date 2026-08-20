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
export declare class Chrome {
  private readonly page;
  readonly layoutNavigation: Locator;
  readonly primaryNavigation: Locator;
  readonly primaryNavigationItems: Locator;
  readonly pageTitle: Locator;
  readonly logo: Locator;
  readonly searchInput: Locator;
  readonly searchNoResults: Locator;
  private readonly nextChromeHeader;
  private readonly searchButton;
  constructor(page: ScoutPage);
  isNextChrome(): Promise<boolean>;
  clickLogo(): Promise<void>;
  openSearch(): Promise<void>;
  search(term: string): Promise<void>;
  getSearchOptionByUrl(url: string): Locator;
  navItemInPrimaryById(id: string): Locator;
  badgeWithLabel(label: string): Locator;
}
