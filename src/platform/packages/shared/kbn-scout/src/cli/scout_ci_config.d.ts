/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type ScoutCiConfigModuleKind = 'plugins' | 'packages';
export interface ScoutCiConfigModule {
  kind: ScoutCiConfigModuleKind;
  name: string;
}
export declare const getScoutCiConfigModuleFromPath: (relativePath: string) => ScoutCiConfigModule;
export interface UpsertScoutCiConfigModuleResult {
  updatedYml: string;
  didChange: boolean;
  wasAlreadyEnabled: boolean;
  movedFromDisabled: boolean;
}
export declare const upsertEnabledModuleInScoutCiConfigYml: (
  yml: string,
  module: ScoutCiConfigModule
) => UpsertScoutCiConfigModuleResult;
