/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface ScoutTestableModule {
  name: string;
  group: string;
  type: 'plugin' | 'package';
  visibility: 'shared' | 'private';
  root: string;
}
export interface ScoutTestableModuleWithConfigs extends ScoutTestableModule {
  configs: Omit<ScoutTestConfig, 'module'>[];
}
import { type ScoutTestConfig } from './test_config';
export declare const testableModules: {
  readonly all: ScoutTestableModule[];
  readonly allIncludingConfigs: ScoutTestableModuleWithConfigs[];
  ofType(moduleType: ScoutTestableModule['type']): ScoutTestableModule[];
  readonly plugins: ScoutTestableModule[];
  readonly packages: ScoutTestableModule[];
};
