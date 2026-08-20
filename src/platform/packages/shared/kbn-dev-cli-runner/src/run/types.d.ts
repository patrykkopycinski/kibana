import type { ProcRunner } from '@kbn/dev-proc-runner';
import type { LogLevel, ToolingLog } from '@kbn/tooling-log';
import type { CleanupTask } from '../cleanup';
import type { FlagsReader } from '../flags/flags_reader';
import type { MetricsMeta } from '../metrics';
import type { BaseFlags, FlagOptions, Flags } from '../flags/types';
export interface RunContext<TFlags extends BaseFlags = Flags> {
    log: ToolingLog;
    flags: TFlags;
    procRunner: ProcRunner;
    statsMeta: MetricsMeta;
    addCleanupTask: (task: CleanupTask) => void;
    flagsReader: FlagsReader;
}
export type RunFn<T = void, TFlags extends BaseFlags = Flags> = (context: RunContext<TFlags>) => Promise<T> | void;
export interface RunOptions<TFlagOptions extends FlagOptions = FlagOptions> {
    usage?: string;
    description?: string;
    log?: {
        defaultLevel?: LogLevel;
        context?: string;
    };
    flags?: TFlagOptions;
}
