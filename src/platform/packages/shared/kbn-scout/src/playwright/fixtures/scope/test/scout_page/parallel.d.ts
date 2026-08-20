import type { ScoutPage } from '.';
import type { KibanaUrl, ScoutLogger } from '../../worker';
import type { ScoutSpaceParallelFixture } from '../../worker/scout_space';
export declare const scoutPageParallelFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions & {
    page: ScoutPage;
}, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & {
    log: ScoutLogger;
    kbnUrl: KibanaUrl;
    scoutSpace: ScoutSpaceParallelFixture;
}>;
