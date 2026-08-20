/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { ModuleDiscoveryInfo } from './types';
export declare const getScoutCiExcludedConfigs: () => string[];
/**
 * Filters modules based on Scout CI configuration.
 * Validates that all modules are registered in the CI config ('scout_ci_config.yml') and
 * returns only enabled modules.
 * Throws an error if any module with Scout tests is not registered in the CI config.
 *
 * @param log - Tooling log instance for warnings
 * @param modulesWithTests - Array of modules to filter
 * @returns Filtered array containing enabled modules
 */
export declare const filterModulesByScoutCiConfig: (
  log: ToolingLog,
  modulesWithTests: ModuleDiscoveryInfo[]
) => ModuleDiscoveryInfo[];
