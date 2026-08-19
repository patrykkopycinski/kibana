import { PerformanceTracker } from './performance_tracker';
export declare const perfTrackerFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions & {
    perfTracker: PerformanceTracker;
}, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("../../worker/core_fixtures").BaseWorkerFixtures & {
    samlAuth: import("../../worker").SamlAuth;
}>;
export type PerfTrackerFixture = ReturnType<typeof perfTrackerFixture>;
