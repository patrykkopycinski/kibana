import type { BrowserContext } from 'playwright/test';
/**
 * Extends the default Playwright browser context to add initialization scripts
 * that run before any page is loaded. This is the recommended place to set
 * global localStorage flags or other browser-level initialization.
 *
 * The init script will be executed for all pages created from this context,
 * ensuring consistent browser state across all tests.
 */
export declare const pageContextFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions & {
    context: BrowserContext;
}, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("../../worker/core_fixtures").BaseWorkerFixtures & {
    samlAuth: import("../../worker").SamlAuth;
}>;
