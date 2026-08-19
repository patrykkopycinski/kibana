import type { ToolingLog } from '@kbn/tooling-log';
import type { ScoutTestTarget } from '@kbn/scout-info';
import { Config } from '../config';
/**
 * Loads server configuration based on the mode, creates "kbn-test" compatible Config
 * instance, that can be used to start local servers and saves its "Scout"-format copy
 * to the disk.
 *
 * HTTP/2 is disabled by default. To enable it, set `http2: true` in the server config.
 *
 * @param testTarget The test target definition (based on location, architecture and domain)
 * @param log Logger instance to report errors or debug information.
 * @param configRootDir The root directory where the config file is located
 *
 * @example
 * Config root dirs
 * ```
 * servers/configs/config_sets/default/serverless
 * servers/configs/config_sets/uiam_local/serverless
 * ```
 * @returns "kbn-test" compatible Config instance
 */
export declare function loadServersConfig(testTarget: ScoutTestTarget, log: ToolingLog, configRootDir: string): Promise<Config>;
