import type { ToolingLog } from '@kbn/tooling-log';
import type { ScoutTestConfig } from '../../../types';
/**
 * Saves Scout server configuration to the disk.
 * @param testServersConfig configuration to be saved
 * @param log Logger instance to report errors or debug information.
 */
export declare const saveScoutTestConfigOnDisk: (testServersConfig: ScoutTestConfig, log: ToolingLog) => void;
