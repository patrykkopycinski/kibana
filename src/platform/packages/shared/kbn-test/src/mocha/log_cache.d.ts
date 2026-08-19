/**
 * Add a chunk of log output to the cached
 * output for a suite
 * @param {import('../functional_test_runner/fake_mocha_types').Suite} suite
 * @param {string} chunk
 */
export declare function recordLog(suite: import('../functional_test_runner/fake_mocha_types').Suite, chunk: string): void;
/**
 * Snapshot the logs from this runnable's suite at this point,
 * as the suite logs will get updated to include output from
 * subsequent runnables
 * @param {import('../functional_test_runner/fake_mocha_types').Runnable} runnable
 * @param {Mocha.Runnable} runnable
 */
export declare function snapshotLogsForRunnable(runnable: import('../functional_test_runner/fake_mocha_types').Runnable): void;
/**
 * Get the suite logs as they were when the logs for this runnable
 * were snapshotted
 * @param {import('../functional_test_runner/fake_mocha_types').Runnable} runnable
 */
export declare function getSnapshotOfRunnableLogs(runnable: import('../functional_test_runner/fake_mocha_types').Runnable): any;
