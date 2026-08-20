import type { ToolingLog } from '@kbn/tooling-log';
export interface IndexStats {
    skipped: boolean;
    deleted: boolean;
    created: boolean;
    archived: boolean;
    waitForSnapshot: number;
    configDocs: {
        upgraded: number;
        tagged: number;
        upToDate: number;
    };
    docs: {
        indexed: number;
        archived: number;
    };
}
export type Stats = ReturnType<typeof createStats>;
export declare function createStats(name: string, log: ToolingLog): {
    /**
     * Record that an index was not restored because it already existed
     * @param index
     */
    skippedIndex(index: string): void;
    /**
     * Record that the esArchiver waited for an index that was in the middle of being snapshotted
     * @param index
     */
    waitingForInProgressSnapshot(index: string): void;
    /**
     * Record that an index was deleted
     * @param index
     */
    deletedIndex(index: string): void;
    /**
     * Record that a data stream was deleted
     * @param index
     */
    deletedDataStream(stream: string, template: string): void;
    /**
     * Record that an index was created
     * @param index
     */
    createdIndex(index: string, metadata?: Record<string, any>): void;
    /**
     * Record that a data stream was created
     * @param index
     */
    createdDataStream(stream: string, template: string, metadata?: Record<string, any>): void;
    /**
     * Record that an index was written to the archives
     * @param index
     */
    archivedIndex(index: string, metadata?: Record<string, any>): void;
    /**
     * Record that a document was written to elasticsearch
     * @param index
     */
    indexedDoc(index: string): void;
    /**
     * Record that a document was added to the archives
     * @param index
     */
    archivedDoc(index: string): void;
    /**
     * Get a plain object version of the stats by index
     */
    toJSON(): Record<string, IndexStats>;
    /**
     * Iterate the status for each index
     * @param fn
     */
    forEachIndex(fn: (index: string, stats: IndexStats) => void): void;
};
