/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Config } from '../config';
import type { Lifecycle } from '../lifecycle';
import type { ProviderCollection } from '../providers';
interface Options {
  mocha: any;
  log: ToolingLog;
  config: Config;
  lifecycle: Lifecycle;
  providers: ProviderCollection;
  paths: string[];
  updateBaselines: boolean;
  updateSnapshots: boolean;
}
/**
 *  Load an array of test files or a test provider into a mocha instance
 */
export declare const loadTests: ({
  mocha,
  log,
  config,
  lifecycle,
  providers,
  paths,
  updateBaselines,
  updateSnapshots,
}: Options) => void;
export {};
