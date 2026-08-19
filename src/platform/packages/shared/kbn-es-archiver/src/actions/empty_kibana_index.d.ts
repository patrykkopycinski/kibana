import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
export declare function emptyKibanaIndexAction({ client, log }: {
    client: Client;
    log: ToolingLog;
}): Promise<Record<string, import("../lib/stats").IndexStats>>;
