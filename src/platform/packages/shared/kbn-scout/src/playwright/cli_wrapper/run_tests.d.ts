/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
export interface PlaywrightTestCLIOptions {
  browser?: 'all' | 'chromium' | 'firefox' | 'webkit';
  config?: string;
  debug?: boolean;
  failOnFlakyTests?: boolean;
  forbidOnly?: boolean;
  fullyParallel?: boolean;
  grep?: string;
  grepInvert?: string;
  globalTimeoutMs?: number;
  headed?: boolean;
  ignoreSnapshots?: boolean;
  workers?: number | string;
  lastFailed?: boolean;
  list?: boolean;
  maxFailures?: number;
  noDeps?: boolean;
  onlyChangedRef?: string;
  outputDir?: string;
  passWithNoTests?: boolean;
  project?: string;
  quiet?: boolean;
  repeatEach?: number;
  reporters?: (
    | 'list'
    | 'line'
    | 'dot'
    | 'json'
    | 'junit'
    | 'null'
    | 'github'
    | 'html'
    | 'blob'
    | string
  )[];
  retries?: number;
  shard?: string;
  timeoutMs?: number;
  trace?:
    | 'on'
    | 'off'
    | 'on-first-retry'
    | 'on-all-retries'
    | 'retain-on-failure'
    | 'retain-on-first-failure';
  tsconfig?: string;
  updateSnapshots?: 'all' | 'changed' | 'missing' | 'none';
  ui?: boolean;
  uiHost?: string;
  uiPort?: number;
  updateSourceMethod?: 'overwrite' | '3way' | 'patch';
  stopAfterFirstFailure?: boolean;
}
export declare function runPlaywrightTestCLI(
  options: PlaywrightTestCLIOptions,
  env?: Record<string, string>,
  log?: ToolingLog
): Promise<import('./common').PlaywrightCLIResult>;
