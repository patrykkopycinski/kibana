import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/kbn-client';
export interface GetEvaluationsKbnClientParams {
    kbnClient: KbnClient;
    log: ToolingLog;
    evaluationsKbnUrl?: string;
    evaluationsKbnApiKey?: string;
    createKbnClient?: (args: {
        log: ToolingLog;
        url: string;
    }) => KbnClient;
}
export declare function withKbnClientDefaultHeaders(kbnClient: KbnClient, defaultHeaders: Record<string, string>): KbnClient;
export declare function withKbnClientApiKeyAuth(kbnClient: KbnClient, apiKey: string): KbnClient;
export declare function getEvaluationsKbnClient({ kbnClient, log, evaluationsKbnUrl, evaluationsKbnApiKey, createKbnClient, }: GetEvaluationsKbnClientParams): KbnClient;
