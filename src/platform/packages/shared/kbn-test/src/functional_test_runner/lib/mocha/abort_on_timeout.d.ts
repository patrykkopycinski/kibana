import type { ToolingLog } from '@kbn/tooling-log';
import type { Lifecycle } from '../lifecycle';
import type { Runner } from '../../fake_mocha_types';
/**
 * On the first Mocha timeout (test or hook), abort the whole config run via
 * `lifecycle.abort()` instead of letting the run limp through remaining tests and the
 * full `afterTestSuite`/after-all teardown cascade (see `wrapRunnableArgs`).
 *
 * Listens on the Mocha `Runner`'s `fail` event rather than the FTR `testFailure` /
 * `testHookFailure` lifecycle events: a Mocha timeout completes the runnable directly
 * via its own timer (`Runnable#resetTimeout`) without ever rejecting the runnable's
 * promise, so those lifecycle events never fire for timeouts.
 *
 * Detection relies on the error's `code` rather than its message: ordinary request
 * libraries (e.g. superagent, which underlies supertest) build their own timeout errors
 * with a message like "Timeout of 5000ms exceeded", which would be indistinguishable from
 * a real Mocha timeout if we matched on message text alone. Mocha's own timeout error is
 * always tagged with `MOCHA_TIMEOUT_ERROR_CODE`, so checking `err.code` avoids false
 * positives on ordinary (non-timeout) test failures.
 *
 * Ordinary (non-timeout) failures are left alone so Smart Retry's failing-test set
 * stays meaningful.
 */
export declare function registerAbortOnTimeout(runner: Runner, lifecycle: Lifecycle, log: ToolingLog): void;
