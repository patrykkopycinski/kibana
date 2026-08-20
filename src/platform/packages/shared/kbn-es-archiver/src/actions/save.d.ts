import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
export declare function saveAction({ outputDir, indices, client, log, raw, keepIndexNames, query, }: {
    outputDir: string;
    indices: string | string[];
    client: Client;
    log: ToolingLog;
    raw: boolean;
    keepIndexNames?: boolean;
    query?: Record<string, any>;
}): Promise<Record<string, import("../lib/stats").IndexStats>>;
