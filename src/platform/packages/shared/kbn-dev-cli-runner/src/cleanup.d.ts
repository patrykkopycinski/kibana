import type { ToolingLog } from '@kbn/tooling-log';
/**
 * A function which will be called when the CLI is torn-down which should
 * quickly cleanup whatever it needs.
 */
export type CleanupTask = () => void;
export declare class Cleanup {
    private readonly log;
    helpText: string;
    private readonly tasks;
    static setup(log: ToolingLog, helpText: string): Cleanup;
    constructor(log: ToolingLog, helpText: string, tasks: CleanupTask[]);
    add(task: CleanupTask): void;
    execute(topLevelError?: any): void;
    private onError;
}
