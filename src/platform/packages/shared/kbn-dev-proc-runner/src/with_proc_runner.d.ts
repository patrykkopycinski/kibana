import type { ToolingLog } from '@kbn/tooling-log';
import { ProcRunner } from './proc_runner';
/**
 *  Create a ProcRunner and pass it to an async function. When
 *  the async function finishes the ProcRunner is torn-down
 *  automatically
 *
 *  @param  {ToolingLog} log
 *  @param  {async Function} fn
 *  @return {Promise<undefined>}
 */
export declare function withProcRunner<T = void>(log: ToolingLog, fn: (procs: ProcRunner) => Promise<T>): Promise<void>;
