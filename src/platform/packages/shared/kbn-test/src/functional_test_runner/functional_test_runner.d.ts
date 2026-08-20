/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Config, EsVersion } from './lib';
export declare class FunctionalTestRunner {
  private readonly log;
  private readonly config;
  private readonly esVersion;
  constructor(log: ToolingLog, config: Config, esVersion?: string | EsVersion);
  run(abortSignal?: AbortSignal, retry?: number): Promise<any>;
  private runWithResult;
  private createRetryConfig;
  private validateEsVersion;
  getTestStats(): Promise<
    | {
        testCount: number;
        nonSkippedTestCount: number;
        testsExcludedByTag: any;
      }
    | undefined
  >;
  private getStubProviderCollection;
  private runHarness;
  private triggerCleanup;
  simulateMochaDryRun(mocha: any): number;
}
