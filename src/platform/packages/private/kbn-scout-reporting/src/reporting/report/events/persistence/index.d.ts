import { ToolingLog } from '@kbn/tooling-log';
import type { Client as ESClient } from '@elastic/elasticsearch';
import type { ScoutReportEvent } from '../event';
export declare class ScoutReportDataStream {
    private es;
    private log;
    constructor(es: ESClient, log?: ToolingLog);
    exists(): Promise<boolean>;
    initialize(): Promise<void>;
    setupComponentTemplates(): Promise<void>;
    setupIndexTemplate(): Promise<void>;
    addEvent(event: ScoutReportEvent): Promise<void>;
    addEventsFromFile(...eventLogPaths: string[]): Promise<void>;
}
