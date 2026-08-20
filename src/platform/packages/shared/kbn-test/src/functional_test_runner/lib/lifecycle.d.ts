import type * as Rx from 'rxjs';
import type { ToolingLog } from '@kbn/tooling-log';
import type { LifecyclePhase } from './lifecycle_phase';
import type { Suite, Test } from '../fake_mocha_types';
export declare class Lifecycle {
    /** root subscription to cleanup lifecycle phases when lifecycle completes */
    private readonly sub;
    /** lifecycle phase that will run handlers once before tests execute */
    readonly beforeTests: LifecyclePhase<[Suite]>;
    /** lifecycle phase that runs handlers before each runnable (test and hooks) */
    readonly beforeEachRunnable: LifecyclePhase<[Test]>;
    /** lifecycle phase that runs handlers before each suite */
    readonly beforeTestSuite: LifecyclePhase<[Suite]>;
    /** lifecycle phase that runs handlers before each test */
    readonly beforeEachTest: LifecyclePhase<[Test]>;
    /** lifecycle phase that runs handlers after each suite */
    readonly afterTestSuite: LifecyclePhase<[Suite]>;
    /** lifecycle phase that runs handlers after a test fails */
    readonly testFailure: LifecyclePhase<[Error, Test]>;
    /** lifecycle phase that runs handlers after a hook fails */
    readonly testHookFailure: LifecyclePhase<[Error, Test]>;
    /** lifecycle phase that runs handlers at the very end of execution */
    readonly cleanup: LifecyclePhase<[]>;
    /** non-singular channel used to force an immediate abort of the current config run */
    private readonly abort$$;
    readonly abort$: Rx.Observable<string>;
    /** true once `abort()` has been called */
    isAborting: boolean;
    constructor(log: ToolingLog);
    /** signal that the current config run should abort immediately; idempotent */
    abort(reason: string): void;
}
