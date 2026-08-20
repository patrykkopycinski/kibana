/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import { ScoutReport } from '../base';
import type { TestFailure } from './test_failure';
export declare class ScoutFailureReport extends ScoutReport {
  constructor(log?: ToolingLog);
  get testFailuresPath(): string;
  /**
   * Logs a failure to be processed by this reporter
   *
   * @param failure {TestFailure} - test failure to record
   */
  logEvent(failure: TestFailure): void;
  /**
   * Save the report to a non-ephemeral location
   *
   * @param destination - Full path to the save location. Must not exist.
   */
  save(destination: string): void;
  /**
   * Save test failure attachments as individual PNG files for Buildkite artifact upload
   */
  private saveAttachmentsAsPngFiles;
  /**
   * Reads all failures from the NDJSON file and parses them as TestFailure[].
   */
  private readFailuresFromNDJSON;
}
