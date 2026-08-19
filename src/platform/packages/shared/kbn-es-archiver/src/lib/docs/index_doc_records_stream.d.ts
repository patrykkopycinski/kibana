import type { Client } from '@elastic/elasticsearch';
import { Writable } from 'stream';
import type { Stats } from '../stats';
import type { Progress } from '../progress';
export declare function createIndexDocRecordsStream(client: Client, stats: Stats, progress: Progress, useCreate?: boolean, performance?: LoadActionPerfOptions, targetsWithoutIdGeneration?: string[]): Writable;
export interface LoadActionPerfOptions {
    batchSize?: number;
    concurrency?: number;
}
