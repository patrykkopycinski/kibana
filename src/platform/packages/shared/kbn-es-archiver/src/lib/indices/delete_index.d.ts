import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Stats } from '../stats';
export declare function deleteIndex(options: {
    client: Client;
    stats: Stats;
    index: string | string[];
    log: ToolingLog;
    retryIfSnapshottingCount?: number;
}): Promise<void>;
/**
 * Determine if an error is complaining about a delete while
 * a snapshot is in progress
 * @param  {Error} error
 * @return {Boolean}
 */
export declare function isDeleteWhileSnapshotInProgressError(error: any): any;
/**
 * Wait for the any snapshot in any repository that is
 * snapshotting this index to complete.
 */
export declare function waitForSnapshotCompletion(client: Client, index: string | string[], log: ToolingLog): Promise<void>;
