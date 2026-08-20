import type { Command } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export interface EventUploadOptions {
    esURL: string;
    esAPIKey: string;
    verifyTLSCerts: boolean;
    log: ToolingLog;
}
export declare const uploadAllEventsFromPath: (eventLogPath: string, options: EventUploadOptions) => Promise<void>;
export declare const nonThrowingUploadAllEventsFromPath: (eventLogPath: string, options: EventUploadOptions) => Promise<void>;
export declare const uploadEvents: Command<void>;
