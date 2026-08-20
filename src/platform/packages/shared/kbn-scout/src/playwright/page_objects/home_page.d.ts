/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
export declare class HomePage {
  private readonly page;
  constructor(page: ScoutPage);
  get homeApp(): import('playwright-core').Locator;
  get manageSection(): import('playwright-core').Locator;
  get stackManagementButton(): import('playwright-core').Locator;
  goto(spaceId?: string): Promise<void>;
  getVisibleSolutions(): Promise<string[]>;
}
