import type { KbnClientStatus } from './kbn_client_status';
export declare class KbnClientVersion {
    private readonly status;
    private versionCache;
    constructor(status: KbnClientStatus);
    get(): Promise<string>;
}
