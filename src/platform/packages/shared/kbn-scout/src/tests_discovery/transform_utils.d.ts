import type { FlattenedConfigGroup, ModuleDiscoveryInfo } from './types';
export declare const countModulesByType: (modules: ModuleDiscoveryInfo[]) => {
    plugins: number;
    packages: number;
};
/**
 * Flattens ModuleDiscoveryInfo[] into an array grouped by mode, group, and server run flag
 * for qaf-tests run (Cloud test execution)
 */
export declare const flattenModulesByServerRunFlag: (modules: ModuleDiscoveryInfo[]) => FlattenedConfigGroup[];
