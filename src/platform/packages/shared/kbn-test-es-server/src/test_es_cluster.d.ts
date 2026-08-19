import { Cluster } from '@kbn/es';
import { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { ArtifactLicense } from '@kbn/es';
import type { ServerlessOptions } from '@kbn/es/src/utils';
interface TestEsClusterNodesOptions {
    name: string;
    /**
     * Depending on the test you are running, it may be necessary to
     * configure a separate data archive for each node in the cluster.
     * In that case, you can configure each of the archive paths here.
     *
     * Specifying a top-level `dataArchive` is not necessary if you are using
     * this option; per-node archives will always be used if provided.
     */
    dataArchive?: string;
}
export interface ICluster {
    ports: number[];
    nodes: Cluster[];
    getStartTimeout: () => number;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    cleanup: () => Promise<void>;
    getClient: () => Client;
    getHostUrls: () => string[];
}
export type EsTestCluster<Options extends CreateTestEsClusterOptions = CreateTestEsClusterOptions> = Options['nodes'] extends TestEsClusterNodesOptions[] ? ICluster : ICluster & {
    getUrl: () => string;
};
export interface CreateTestEsClusterOptions {
    basePath?: string;
    clusterName?: string;
    /**
     * Path to data archive snapshot to run Elasticsearch with.
     * To prepare the snapshot:
     * - run Elasticsearch server
     * - index necessary data
     * - stop Elasticsearch server
     * - go to Elasticsearch folder: cd .es/${ELASTICSEARCH_VERSION}
     * - archive data folder: zip -r my_archive.zip data
     */
    dataArchive?: string;
    /**
     * Elasticsearch configuration options. These are key/value pairs formatted as:
     * `['key.1=val1', 'key.2=val2']`
     */
    esArgs?: string[];
    esVersion?: string;
    esFrom?: string;
    esServerlessOptions?: Pick<ServerlessOptions, 'image' | 'tag' | 'resources' | 'host' | 'projectType' | 'dataPath' | 'uiam' | 'uiamOAuth'>;
    esJavaOpts?: string;
    /**
     * Controls how much of Elasticsearch stdout is forwarded to the `ToolingLog`.
     *
     * Defaults to `'warn'`.
     */
    esStdoutLogLevel?: 'all' | 'info' | 'warn' | 'error' | 'silent';
    /**
     * License to run your cluster under. Keep in mind that a `trial` license
     * has an expiration date. If you are using a `dataArchive` with your tests,
     * you'll likely need to use `basic` or `gold` to prevent the test from failing
     * when the license expires.
     */
    license?: ArtifactLicense;
    log: ToolingLog;
    writeLogsToPath?: string;
    /**
     * Node-specific configuration if you wish to run a multi-node
     * cluster. One node will be added for each item in the array.
     *
     * If this option is not provided, the config will default
     * to a single-node cluster.
     *
     * @example
     * {
     *   nodes: [
     *     {
     *       name: 'node-01',
     *       dataArchive: Path.join(__dirname, 'path', 'to', 'data_01')
     * .   },
     *     {
     *       name: 'node-02',
     *       dataArchive: Path.join(__dirname, 'path', 'to', 'data_02')
     * .   },
     *   ],
     * }
     */
    nodes?: TestEsClusterNodesOptions[];
    /**
     * Password for the `elastic` user. This is set after the cluster has started.
     *
     * Defaults to `changeme`.
     */
    password?: string;
    /**
     * Port to run Elasticsearch on. If you configure a
     * multi-node cluster with the `nodes` option, this
     * port will be incremented by one for each added node.
     *
     * @example
     * {
     *   nodes: [
     *     {
     *       name: 'node-01',
     *       dataArchive: Path.join(__dirname, 'path', 'to', 'data_01')
     * .   },
     *     {
     *       name: 'node-02',
     *       dataArchive: Path.join(__dirname, 'path', 'to', 'data_02')
     * .   },
     *   ],
     *   port: 6200, // node-01 will use 6200, node-02 will use 6201
     * }
     */
    port?: number;
    /**
     * Should this ES cluster use SSL?
     */
    ssl?: boolean;
    /**
     * Explicit transport port for a single node to run on, or a string port range to use eg. '9300-9400'
     * defaults to the transport port from `src/platform/packages/shared/kbn-test/src/es/es_test_config.ts`
     */
    transportPort?: number | string;
    /**
     * Report to the creator of the es-test-cluster that the es node has exitted before stop() was called, allowing
     * this caller to react appropriately. If this is not passed then an uncatchable exception will be thrown
     */
    onEarlyExit?: (msg: string) => void;
    /**
     * Is this a serverless project
     */
    serverless?: boolean;
    /**
     * Clean existing serverless object store data before startup.
     *
     * Defaults to `true` for backwards compatibility.
     */
    clean?: boolean;
    /**
     * Files to mount inside ES containers
     */
    files?: string[];
    /**
     * Secure settings files to add to the ES keystore via `elasticsearch-keystore add-file`.
     * Each entry is a `setting_name=/path/to/file` string.
     */
    secureFiles?: string[];
}
export declare function createTestEsCluster<Options extends CreateTestEsClusterOptions = CreateTestEsClusterOptions>(options: Options): EsTestCluster<Options>;
export {};
