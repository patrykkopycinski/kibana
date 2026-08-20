import type { ToolingLog } from '@kbn/tooling-log';
export declare function editAction({ path, log, handler, }: {
    path: string;
    log: ToolingLog;
    handler: () => Promise<any>;
}): Promise<void>;
