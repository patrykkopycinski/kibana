/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
export declare function silence(log: ToolingLog, milliseconds: number): Promise<void>;
/**
 * Measure the performance of a sync function
 */
export declare const measurePerformance: <T>(log: ToolingLog, label: string, fn: () => T) => T;
/**
 * Measure the performance of an async function
 */
export declare const measurePerformanceAsync: <T>(
  log: ToolingLog,
  label: string,
  fn: () => Promise<T>
) => Promise<T>;
export { validateAndProcessTestFiles, type TestFilesValidationResult } from './test_files';
