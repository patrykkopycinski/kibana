/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface KibanaJsoncMetadata {
  id: string;
  type: string;
  group: string;
  owner: string | string[];
  visibility: string;
  plugin?: {
    id: string;
  };
}
export interface KibanaModuleMetadata {
  id: string;
  type: string;
  group: string;
  owner: string[];
  visibility: string;
}
/**
 * Resolves the path to the `kibana.jsonc` manifest based on the Playwright configuration file path.
 * @param configPath - Absolute path to the Playwright configuration file.
 * @returns Absolute path to the `kibana.jsonc` file.
 * @throws Error if `scout` or `scout_*` is not found in the path.
 */
export declare const getKibanaModulePath: (configPath: string) => string;
/**
 * Reads and parses the `kibana.jsonc` manifest file.
 * @param filePath - Absolute path to the `kibana.jsonc` file.
 * @returns Parsed `KibanaModuleMetadata` object.
 * @throws Error if the file does not exist, cannot be read, or is invalid.
 */
export declare const readKibanaModuleManifest: (filePath: string) => KibanaModuleMetadata;
/**
 * Resolves the module manifest file path and reads its content.
 * @param configPath - Absolute path to the Playwright configuration file in the plugin directory.
 * @returns Parsed `KibanaModuleMetadata` object.
 */
export declare const getKibanaModuleData: (configPath: string) => KibanaModuleMetadata;
