import { ToolingLog } from '@kbn/tooling-log';
import type { ScoutReportEvent } from './event';
import { ScoutReport } from '../base';
/**
 *
 */
export declare class ScoutEventsReport extends ScoutReport {
    private readonly eventLogFileDescriptor;
    constructor(log?: ToolingLog);
    get eventLogPath(): string;
    /**
     * Logs an event to be processed by this reporter
     *
     * @param event {ScoutReportEvent} - Event to record
     */
    logEvent(event: ScoutReportEvent): void;
    /**
     * Save the report to a non-ephemeral location
     *
     * @param destination - Full path to the save location. Must not exist.
     */
    save(destination: string): void;
}
