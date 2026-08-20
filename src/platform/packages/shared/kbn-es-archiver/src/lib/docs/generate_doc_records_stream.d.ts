import type { Transform } from 'stream';
import type { Client } from '@elastic/elasticsearch';
import type { Stats } from '../stats';
import type { Progress } from '../progress';
export declare function createGenerateDocRecordsStream({ client, stats, progress, keepIndexNames, query, }: {
    client: Client;
    stats: Stats;
    progress: Progress;
    keepIndexNames?: boolean;
    query?: Record<string, any>;
}): Transform;
