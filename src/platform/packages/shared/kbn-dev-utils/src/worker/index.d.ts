import ChildProcess, { type ForkOptions } from 'child_process';
import * as Rx from 'rxjs';
import type { SomeDevLog } from '@kbn/some-dev-log';
interface StartTSWorkerArgs extends ForkOptions {
    log: SomeDevLog;
    /** Path to worker source. Best practice to `require.resolve('../relative/paths')` */
    src: string;
}
/**
 * Provide a TS file as the src of a NodeJS Worker with some built-in handling
 * of std streams and debugging.
 */
export declare function startTSWorker<Message>({ log, src, cwd, execArgv, stdio, ...forkOptions }: StartTSWorkerArgs): {
    msg$: Rx.Observable<Message>;
    proc: ChildProcess.ChildProcess;
};
export {};
