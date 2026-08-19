import type { BrowserContext } from 'playwright/test';
/**
 * Launches browser with persistent context across multiple tests / browser windows in the same test.
 * E.g. Lighthouse launches a new browser window and the authentication state
 * is not persisted between windows by default, so we can't do page audit without persistent context.
 */
export declare const persistentContextFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions & {
    context: BrowserContext;
}, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("../../worker/core_fixtures").BaseWorkerFixtures & {
    samlAuth: import("../../worker").SamlAuth;
} & {
    debuggingPort: number;
}>;
