import type { ToolingLog } from '@kbn/tooling-log';
import type { ProcOptions } from './proc';
interface RunOptions extends ProcOptions {
    /**
     * When omitted or `false`, start the process and return without waiting for a log line or exit.
     * `true` waits for the process to exit; a `RegExp` waits for a matching log line.
     */
    wait?: true | RegExp | false;
    waitTimeout?: number | false;
    onEarlyExit?: (msg: string) => void;
}
/**
 *  Helper for starting and managing processes. In many ways it resembles the
 *  API from `grunt_run`, processes are named and can be started, waited for,
 *  backgrounded once they log something matching a RegExp...
 *
 *  @class ProcRunner
 */
export declare class ProcRunner {
    private readonly log;
    private closing;
    private procs;
    private signalUnsubscribe;
    constructor(log: ToolingLog);
    /**
     *  Start a process, tracking it by `name`
     */
    run(name: string, options: RunOptions): Promise<void>;
    /**
     *  Stop a named proc
     */
    stop(name: string, signal?: NodeJS.Signals): Promise<void>;
    /**
     *  Wait for all running processes to stop naturally
     *  @return {Promise<undefined>}
     */
    waitForAllToStop(): Promise<void>;
    /**
     *  Close the ProcRunner and stop all running
     *  processes with `signal`
     *
     *  @param  {String} [signal=undefined]
     *  @return {Promise}
     */
    teardown(signal?: NodeJS.Signals | 'exit'): Promise<void>;
    private getProc;
    private startProc;
}
export {};
