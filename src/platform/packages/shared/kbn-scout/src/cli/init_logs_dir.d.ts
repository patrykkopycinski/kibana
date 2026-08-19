import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Ensures the logs directory exists and logs where Kibana/ES output will be written.
 * Duplicated from @kbn/test so Scout does not depend on @kbn/test for CLI-only behavior.
 */
export declare function initLogsDir(log: ToolingLog, logsDir: string): Promise<void>;
