import * as Rx from 'rxjs';
import type { ToolingLog } from '@kbn/tooling-log';
export interface ProcOptions {
    cmd: string;
    args: string[];
    cwd: string;
    env?: Record<string, string | undefined>;
    stdin?: string;
    writeLogsToPath?: string;
    /** When provided, each output line (ANSI-stripped) is pushed to this array. */
    captureOutputLines?: string[];
}
export type Proc = ReturnType<typeof startProc>;
export declare function startProc(name: string, options: ProcOptions, log: ToolingLog): {
    name: string;
    lines$: Rx.Observable<string>;
    outcome$: Rx.Observable<number | null>;
    outcomePromise: Promise<number | null>;
    stop: (signal: NodeJS.Signals) => Promise<void>;
    stopWasCalled(): boolean;
};
