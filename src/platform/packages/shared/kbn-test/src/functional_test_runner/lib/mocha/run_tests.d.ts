/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Lifecycle } from '../lifecycle';
import type { Mocha } from '../../fake_mocha_types';
export interface RunTestsResult {
  failureCount: number;
  failedTestFiles: string[];
}
/**
 *  Run the tests that have already been loaded into mocha. Aborts on 'cleanup'
 *  lifecycle runs and, when `abortOnTimeout` is enabled, on the first Mocha timeout.
 *
 *  @param  {Lifecycle} lifecycle
 *  @param  {Mocha} mocha
 *  @param  {ToolingLog} log
 *  @param  {{ abortOnTimeout?: boolean }} options
 *  @param  {AbortSignal} [abortSignal]
 *  @return {Promise<RunTestsResult>} resolves to the number of test failures and failed test files
 */
export declare function runTests(
  lifecycle: Lifecycle,
  mocha: Mocha,
  log: ToolingLog,
  {
    abortOnTimeout,
  }?: {
    abortOnTimeout?: boolean;
  },
  abortSignal?: AbortSignal
): Promise<RunTestsResult>;
