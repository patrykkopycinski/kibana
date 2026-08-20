import type { ScoutPage } from '../scout_page';
import type { Network } from './network';
export declare const networkFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions & {
    network: Network;
    page: ScoutPage;
}, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("../../worker/core_fixtures").BaseWorkerFixtures & {
    samlAuth: import("../../worker").SamlAuth;
}>;
export type NetworkFixture = Network;
