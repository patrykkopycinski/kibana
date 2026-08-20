/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Page } from '@playwright/test';
export interface RunA11yScanOptions {
  /** Optional CSS selectors to include in analysis */
  include?: string[];
  /** Optional CSS selectors to exclude from analysis */
  exclude?: string[];
  /** Timeout in ms for the scan (defaults 10000) */
  timeoutMs?: number;
}
export declare const checkA11y: (
  page: Page,
  options?: RunA11yScanOptions
) => Promise<{
  violations: string[];
}>;
