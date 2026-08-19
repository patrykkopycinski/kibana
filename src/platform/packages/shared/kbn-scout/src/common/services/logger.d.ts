import type { LogLevel } from '@kbn/tooling-log';
import { ToolingLog } from '@kbn/tooling-log';
export declare class ScoutLogger extends ToolingLog {
    /**
     * Creates a ScoutLogger instance.
     *
     * Log level resolution priority:
     *   1. The logLevel argument (if provided)
     *   2. The SCOUT_LOG_LEVEL environment variable (if set)
     *   3. The LOG_LEVEL environment variable (if set)
     *   4. The default log level ('info')
     *
     * The log level string is normalized (case-insensitive), and 'quiet' is treated as 'error'.
     * Only valid log levels from LOG_LEVEL_FLAGS are accepted.
     *
     * @param workerContext - Unique context string for the logger
     * @param logLevel - Optional log level string (highest priority)
     */
    constructor(workerContext: string, logLevel?: LogLevel);
    /**
     * Used to log when a service/fixture is loaded
     * @param name unique name of the service
     */
    serviceLoaded(name: string): void;
    /**
     * Used to log a message for a service/fixture
     */
    serviceMessage(name: string, message: string): void;
}
