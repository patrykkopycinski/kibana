/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { ScoutTestableModule } from './testable_module';
import type { ScoutConfigManifest } from './manifest';
export interface ScoutTestConfig {
  path: string;
  category: string;
  type: string;
  namespace: string | undefined;
  module: ScoutTestableModule;
  manifest: ScoutConfigManifest;
  server: {
    configSet: string;
  };
}
export declare const testConfig: {
  fromPath(configPath: string): ScoutTestConfig;
};
export declare const testConfigs: {
  _configs: ScoutTestConfig[] | null;
  log: ToolingLog;
  findPaths(): string[];
  _load(): void;
  reload(): void;
  readonly all: ScoutTestConfig[];
  forModule(name: string, type?: ScoutTestableModule['type']): ScoutTestConfig[];
  forPlugin(pluginName: string): ScoutTestConfig[];
  forPackage(packageName: string): ScoutTestConfig[];
};
