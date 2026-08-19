import { ToolingLog } from '@kbn/tooling-log';
/**
 * Generic error raised by a Scout report
 */
export declare class ScoutReportError extends Error {
}
export declare abstract class ScoutReport {
    log: ToolingLog;
    workDir: string;
    concluded: boolean;
    reportName: string;
    protected constructor(reportName: string, log?: ToolingLog);
    /**
     * Defensive utility function used to guard against modifying the report after it has concluded
     *
     * @param additionalInfo Description of the report action that was prevented
     * @protected
     */
    protected raiseIfConcluded(additionalInfo?: string): void;
    /**
     * Call this when you're done adding information to this report.
     *
     * ⚠️**This will delete all the contents of the report's working directory**
     */
    conclude(): void;
}
