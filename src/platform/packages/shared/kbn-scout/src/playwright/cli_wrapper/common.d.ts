import type { ToolingLog } from '@kbn/tooling-log';
export interface PlaywrightCLIResult {
    exitCode: number;
    stdout?: string;
    stderr?: string;
}
export declare class PlaywrightCLIError extends Error {
}
export declare function runPlaywrightCLI(args: string[], env?: Record<string, string>, log?: ToolingLog): Promise<PlaywrightCLIResult>;
