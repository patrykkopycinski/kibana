import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/test';
import type { Stats } from '../stats';
/**
 * Deletes all saved object indices, or if onlyTaskManager==true, it deletes task_manager indices
 */
export declare function deleteSavedObjectIndices({ client, stats, onlyTaskManager, log, }: {
    client: Client;
    stats: Stats;
    onlyTaskManager?: boolean;
    log: ToolingLog;
}): Promise<string[] | undefined>;
/**
 * Given an elasticsearch client, and a logger, migrates the `.kibana` index. This
 * builds up an object that implements just enough of the kbnMigrations interface
 * as is required by migrations.
 */
export declare function migrateSavedObjectIndices(kbnClient: KbnClient): Promise<void>;
export declare function isSavedObjectIndex(index?: string): index is string;
export declare function cleanSavedObjectIndices({ client, stats, log, index, }: {
    client: Client;
    stats: Stats;
    log: ToolingLog;
    index?: string | string[];
}): Promise<void>;
export declare function createDefaultSpace({ index, client }: {
    index: string;
    client: Client;
}): Promise<void>;
