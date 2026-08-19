import type { Client } from '@elastic/elasticsearch';
import { Transform } from 'stream';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Stats } from '../stats';
export declare function createGenerateIndexRecordsStream({ client, stats, keepIndexNames, log, }: {
    client: Client;
    stats: Stats;
    keepIndexNames?: boolean;
    log: ToolingLog;
}): Transform;
