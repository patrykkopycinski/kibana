import type { ScoutTestTarget } from '@kbn/scout-info';
/**
 * Gets the config file path from a config root directory and mode.
 * @param configRootDir The root directory for the config (e.g., 'default/serverless', 'custom/uiam_local/stateful')
 * @param testTarget The test target definition (based on location, architecture and domain)
 * @returns The full path to the config file
 */
export declare function getConfigFilePath(configRootDir: string, testTarget: ScoutTestTarget): string;
