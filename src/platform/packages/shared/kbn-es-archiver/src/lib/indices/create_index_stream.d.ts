import type { Transform } from 'stream';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Stats } from '../stats';
export declare function createCreateIndexStream({ client, stats, skipExisting, docsOnly, isArchiveInExceptionList, log, targetsWithoutIdGeneration, }: {
    client: Client;
    stats: Stats;
    skipExisting?: boolean;
    docsOnly?: boolean;
    isArchiveInExceptionList?: boolean;
    log: ToolingLog;
    targetsWithoutIdGeneration?: string[];
}): Transform;
