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
export declare const filterModulesByScoutCiConfig: (log: ToolingLog, modulesWithTests: ModuleDiscoveryInfo[]) => ModuleDiscoveryInfo[];
