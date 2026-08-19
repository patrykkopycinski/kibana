import type { ToolingLog } from '@kbn/tooling-log';
export type MetricsMeta = Map<string, string | boolean | number>;
export declare class Metrics {
    private reporter;
    meta: MetricsMeta;
    startTime: number;
    filePath: string;
    constructor(log: ToolingLog);
    createTiming(meta: object, command?: string): {
        group: string;
        id: string;
        ms: number;
        meta: {
            nestedTiming: string | undefined;
        };
    };
    reportCancelled(command?: string): Promise<boolean | undefined>;
    reportSuccess(command?: string): Promise<boolean | undefined>;
    reportError(errorMessage?: string, command?: string): Promise<boolean | undefined>;
}
