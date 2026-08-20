/**
 * Basic set of log-level flags, the common levels implemented between
 * the ToolingLog and the kbn_pm logger
 */
export type SomeLogLevel = 'verbose' | 'debug' | 'info' | 'quiet';
/**
 * Generic interface that is implemented by the ToolingLog and the logger
 * used by kbn_pm, which is responsible for running before the repo is
 * bootstrapped and therefore can't use the ToolingLog.
 */
export interface SomeDevLog {
    /**
     * Log an info message
     */
    info(msg: string, ...rest: any[]): void;
    /**
     * Log a warning message
     */
    warning(msg: string, ...rest: any[]): void;
    /**
     * Log an error message
     */
    error(msg: string, ...rest: any[]): void;
    /**
     * Log a success message
     */
    success(msg: string, ...rest: any[]): void;
    /**
     * Log a debug message. Only printed to the terminal when --debug or --verbose are passed
     */
    debug(msg: string, ...rest: any[]): void;
    /**
     * Log a verbose message. Only printed to the terminal when --verbose is passed
     */
    verbose(msg: string, ...rest: any[]): void;
}
