import type { ToolingLog } from '@kbn/tooling-log';
export declare const getTimeReporter: (log: ToolingLog, group: string) => (startTime: number, id: string, meta: Record<string, any>) => Promise<void>;
