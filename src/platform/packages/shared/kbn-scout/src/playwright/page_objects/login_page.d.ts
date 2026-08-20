/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '../fixtures/scope/test';
import type { KibanaUrl } from '../../common/services/kibana_url';
export declare class LoginPage {
  private readonly page;
  private readonly kbnUrl;
  readonly loginBtn: import('playwright-core').Locator;
  readonly roleSelectionInput: import('playwright-core').Locator;
  constructor(page: ScoutPage, kbnUrl: KibanaUrl);
  goto(): Promise<void>;
  loginWithRole(role: string): Promise<void>;
}
