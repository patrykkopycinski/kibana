import type { ScoutSpaceParallelFixture } from '.';
export declare const scoutSpaceParallelFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("../core_fixtures").BaseWorkerFixtures & {
    samlAuth: import("..").SamlAuth;
} & {
    scoutSpace: ScoutSpaceParallelFixture;
}>;
