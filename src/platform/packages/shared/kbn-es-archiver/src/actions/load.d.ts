import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/test';
import type { Client } from '@elastic/elasticsearch';
import { type LoadActionPerfOptions } from '../lib';
export declare function loadAction({ inputDir, skipExisting, useCreate, docsOnly, client, log, kbnClient, performance, dataOnly, }: {
    inputDir: string;
    skipExisting: boolean;
    useCreate: boolean;
    docsOnly?: boolean;
    client: Client;
    log: ToolingLog;
    kbnClient?: KbnClient;
    performance?: LoadActionPerfOptions;
    dataOnly?: boolean;
}): Promise<Record<string, import("../lib/stats").IndexStats>>;
