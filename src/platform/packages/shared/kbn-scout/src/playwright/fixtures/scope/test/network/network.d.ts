/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Request } from '@playwright/test';
import type { ScoutPage } from '../scout_page';
interface MatchOptions {
  endpoint: string;
  method?: string;
  exactPathname?: boolean;
}
export declare class Network {
  private readonly page;
  constructor(page: ScoutPage);
  matchesEndpoint(request: Request, options: MatchOptions): boolean;
  trackMatchingRequests(
    options: MatchOptions,
    action: (getCount: () => number) => Promise<void>
  ): Promise<number>;
  countMatchingRequests(matchOptions: MatchOptions, action: () => Promise<void>): Promise<number>;
}
export {};
