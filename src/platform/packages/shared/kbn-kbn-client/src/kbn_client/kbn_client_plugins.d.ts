import type { KbnClientStatus } from './kbn_client_status';
export declare class KbnClientPlugins {
    private readonly status;
    constructor(status: KbnClientStatus);
    /**
     * Get a list of plugin ids that are enabled on the server
     */
    getEnabledIds(): Promise<string[]>;
}
