import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/test';
export declare function unloadAction({ inputDir, client, log, }: {
    inputDir: string;
    client: Client;
    log: ToolingLog;
    kbnClient?: KbnClient;
}): Promise<Record<string, import("../lib/stats").IndexStats>>;
