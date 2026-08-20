/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Runner, Test } from '../../../fake_mocha_types';
import type { Config as FTRConfig } from '../../config';
/**
 * Configuration options for the Scout Mocha reporter
 */
export interface ScoutFTRReporterOptions {
  name?: string;
  outputPath?: string;
}
/**
 * Scout Mocha reporter
 */
export declare class ScoutFTRReporter {
  private runner;
  private reporterOptions;
  readonly log: ToolingLog;
  readonly name: string;
  readonly runId: string;
  private report;
  private readonly baseTestRunInfo;
  private readonly codeOwnersEntries;
  constructor(runner: Runner, config: FTRConfig, reporterOptions?: ScoutFTRReporterOptions);
  private getFileOwners;
  private getOwnerAreas;
  private getScoutFileInfoForPath;
  /**
   * Root path of this reporter's output
   */
  get reportRootPath(): string;
  onRunStart: () => void;
  onTestStart: (test: Test) => void;
  onTestEnd: (test: Test) => void;
  onRunEnd: () => void;
}
