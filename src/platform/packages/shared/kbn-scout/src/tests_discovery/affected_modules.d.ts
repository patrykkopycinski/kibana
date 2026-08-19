import type { ToolingLog } from '@kbn/tooling-log';
import type { ModuleDiscoveryInfo } from './types';
/**
 * Mark each module with `isAffected` against an in-memory set of @kbn/ IDs.
 * All modules are returned; downstream callers can drop non-affected ones to
 * implement selective testing.
 *
 * Behavior:
 * - Module maps to an affected @kbn/ ID -> isAffected: true
 * - Module does not map to any @kbn/ ID -> isAffected: false (warn)
 * - Module maps to a @kbn/ ID NOT in affected set -> isAffected: false
 */
export declare const markModulesAffectedStatusFromSet: (modules: ModuleDiscoveryInfo[], affectedModules: ReadonlySet<string>, log: ToolingLog) => ModuleDiscoveryInfo[];
/**
 * Drop configs whose path is not in the `affectedConfigs` allowlist; drop modules
 * left without configs. Surviving configs are by definition affected, so the
 * module's isAffected flag is set to `true`.
 */
export declare const filterModulesByAffectedConfigs: (modules: ModuleDiscoveryInfo[], affectedConfigs: ReadonlySet<string>) => ModuleDiscoveryInfo[];
