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
import type { Config } from '../config';
import type { ProviderCollection } from '../providers';
import type { EsVersion } from '../es_version';
interface Options {
  lifecycle: Lifecycle;
  log: ToolingLog;
  config: Config;
  providers: ProviderCollection;
  esVersion: EsVersion;
  skipRootHooks?: boolean;
  reporter?: any;
  reporterOptions?: any;
}
/**
 *  Instantiate mocha and load testfiles into it
 *  @return {Promise<Mocha>}
 */
export declare function setupMocha({
  lifecycle,
  log,
  config,
  providers,
  esVersion,
  skipRootHooks,
  reporter,
  reporterOptions,
}: Options): Promise<any>;
export {};
