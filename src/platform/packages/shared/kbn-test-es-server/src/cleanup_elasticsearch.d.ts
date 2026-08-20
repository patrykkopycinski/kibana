import type { ToolingLog } from '@kbn/tooling-log';
import type { ICluster } from './test_es_cluster';
export declare function cleanupElasticsearch(node: ICluster, isServerless: boolean, logsDir: string | undefined, log: ToolingLog): Promise<void>;
