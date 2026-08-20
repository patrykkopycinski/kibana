import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/test';
import type { LoadActionPerfOptions } from './lib';
interface Options {
    client: Client;
    baseDir?: string;
    log: ToolingLog;
    kbnClient?: KbnClient;
    /**
     * When true, `kbnClient` is not required and loading archives that contain
     * saved-object indices (.kibana*) will throw an error. Intended for Scout tests and
     * linked CPS projects that should only ingest pure ES data.
     */
    dataOnly?: boolean;
}
export declare class EsArchiver {
    private readonly client;
    private readonly baseDir;
    private readonly log;
    private readonly kbnClient;
    private readonly dataOnly;
    constructor(options: Options);
    /**
     * Extract data and mappings from an elasticsearch index and store
     * it in the baseDir so it can be used later to recreate the index.
     *
     * @param {String} path - relative path to the archive, resolved relative to this.baseDir which defaults to REPO_ROOT
     * @param {String|Array<String>} indices - the indices to archive
     * @param {Object} options
     * @property {Boolean} options.raw - should the archive be raw (unzipped) or not
     * @property {Boolean} options.keepIndexNames - should the Kibana index name be kept as-is or renamed
     */
    save(path: string, indices: string | string[], { raw, keepIndexNames, query, }?: {
        raw?: boolean;
        keepIndexNames?: boolean;
        query?: Record<string, any>;
    }): Promise<Record<string, import("./lib/stats").IndexStats>>;
    /**
     * Load an index from an archive
     *
     * @param {String} path - relative path to the archive to load, resolved relative to this.baseDir which defaults to REPO_ROOT
     * @param {Object} options
     * @property {Boolean} options.skipExisting - should existing indices
     *                                           be ignored or overwritten
     * @property {Boolean} options.useCreate - use a create operation instead of index for documents
     * @property {Boolean} options.docsOnly - load only documents, not indices
     */
    load(path: string, { skipExisting, useCreate, docsOnly, performance, }?: {
        skipExisting?: boolean;
        useCreate?: boolean;
        docsOnly?: boolean;
        performance?: LoadActionPerfOptions;
    }): Promise<Record<string, import("./lib/stats").IndexStats>>;
    /**
     * Remove the indexes in elasticsearch that have data in an archive.
     *
     * @param {String} path - relative path to the archive to unload, resolved relative to this.baseDir which defaults to REPO_ROOT
     */
    unload(path: string): Promise<Record<string, import("./lib/stats").IndexStats>>;
    /**
     * Parse and reformat all of the archives. This is primarily helpful
     * for working on the esArchiver.
     *
     * @param {String} dir - relative path to a directory which contains archives, resolved relative to this.baseDir which defaults to REPO_ROOT
     */
    rebuildAll(dir: string): Promise<void>;
    /**
     * Extract the gzipped files in an archive, then call the handler. When it
     * resolves re-archive the gzipped files.
     *
     * @param {String} path optional prefix to limit archives that are extracted
     * @param {() => Promise<any>} handler
     */
    edit(path: string, handler: () => Promise<void>): Promise<void>;
    /**
     * Just like load, but skips any existing index
     *
     * @param name
     */
    loadIfNeeded(name: string, performance?: LoadActionPerfOptions): Promise<Record<string, import("./lib/stats").IndexStats>>;
    /**
     * Cleanup saved object indices, preserving the space:default saved object.
     */
    emptyKibanaIndex(): Promise<Record<string, import("./lib/stats").IndexStats>>;
    /**
     * Resolve a path relative to the baseDir
     *
     * @param relativePath
     */
    private findArchive;
}
export {};
