/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FlagOptions, FlagsReader } from '@kbn/dev-cli-runner';
import type { ScoutTestTarget } from '@kbn/scout-info';
export interface RunTestsOptions {
  testTarget: ScoutTestTarget;
  configPath: string;
  headed: boolean;
  repeatEach: number | undefined;
  testFiles?: string[];
  esFrom: 'serverless' | 'source' | 'snapshot' | undefined;
  installDir: string | undefined;
  logsDir: string | undefined;
}
export declare const TEST_FLAG_OPTIONS: FlagOptions;
export declare function parseTestFlags(flags: FlagsReader): Promise<{
  testTarget: ScoutTestTarget;
  serverConfigSet: string;
  esFrom: 'serverless' | 'snapshot' | 'source' | undefined;
  preserveEsData: boolean;
  installDir: string | undefined;
  logsDir: string | undefined;
  configPath: string;
  headed: boolean;
  repeatEach: number | undefined;
  testFiles?: string[] | undefined;
}>;
