import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClientRequester } from './kbn_client_requester';
import type { KbnClientSavedObjects } from './kbn_client_saved_objects';
interface ImportApiResponse {
    success: boolean;
    [key: string]: unknown;
}
export declare class KbnClientImportExport {
    readonly log: ToolingLog;
    readonly requester: KbnClientRequester;
    readonly savedObjects: KbnClientSavedObjects;
    readonly baseDir: string;
    constructor(log: ToolingLog, requester: KbnClientRequester, savedObjects: KbnClientSavedObjects, baseDir?: string);
    private resolvePath;
    private resolveAndValidatePath;
    load(path: string, options?: {
        space?: string;
        createNewCopies?: boolean;
    }): Promise<ImportApiResponse>;
    unload(path: string, options?: {
        space?: string;
    }): Promise<void>;
    save(path: string, options: {
        types: string[];
        space?: string;
    }): Promise<void>;
    private req;
}
export {};
