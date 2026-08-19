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
