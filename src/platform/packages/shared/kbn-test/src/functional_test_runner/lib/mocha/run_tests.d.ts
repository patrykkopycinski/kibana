import type { ToolingLog } from '@kbn/tooling-log';
import type { Lifecycle } from '../lifecycle';
import type { Mocha } from '../../fake_mocha_types';
export interface RunTestsResult {
    failureCount: number;
    failedTestFiles: string[];
}
/**
 *  Run the tests that have already been loaded into mocha. Aborts on 'cleanup'
 *  lifecycle runs and, when `abortOnTimeout` is enabled, on the first Mocha timeout.
 *
 *  @param  {Lifecycle} lifecycle
 *  @param  {Mocha} mocha
 *  @param  {ToolingLog} log
 *  @param  {{ abortOnTimeout?: boolean }} options
 *  @param  {AbortSignal} [abortSignal]
 *  @return {Promise<RunTestsResult>} resolves to the number of test failures and failed test files
 */
export declare function runTests(lifecycle: Lifecycle, mocha: Mocha, log: ToolingLog, { abortOnTimeout }?: {
    abortOnTimeout?: boolean;
}, abortSignal?: AbortSignal): Promise<RunTestsResult>;
