import type { KbnClientRequester } from './kbn_client_requester';
interface Status {
    level: 'available' | 'degraded' | 'unavailable' | 'critical';
    summary: string;
    detail?: string;
    documentationUrl?: string;
    meta?: Record<string, unknown>;
}
interface ApiResponseStatus {
    name: string;
    uuid: string;
    version: {
        number: string;
        build_hash: string;
        build_number: number;
        build_snapshot: boolean;
    };
    status: {
        overall: Status;
        core: Record<string, Status>;
        plugins: Record<string, Status>;
    };
    metrics: unknown;
}
export declare class KbnClientStatus {
    private readonly requester;
    constructor(requester: KbnClientRequester);
    /**
     * Get the full server status
     */
    get(): Promise<ApiResponseStatus>;
    /**
     * Get the overall/merged state
     */
    getOverallState(): Promise<"available" | "critical" | "degraded" | "unavailable">;
}
export {};
