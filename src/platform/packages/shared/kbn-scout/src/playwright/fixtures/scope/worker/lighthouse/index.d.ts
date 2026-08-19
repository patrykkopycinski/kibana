import type { RunnerResult } from 'lighthouse';
export interface LighthouseAuditOptions {
    maxWaitForLoad?: number;
    screenEmulation?: {
        width: number;
        height: number;
    };
}
export interface LighthouseFixture {
    runAudit: (url: string, options?: LighthouseAuditOptions) => Promise<RunnerResult>;
}
/**
 * Lighthouse fixture https://developer.chrome.com/docs/lighthouse/overview/
 * It allows to run Lighthouse audits on a given URL
 */
export declare const lighthouseFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions & {
    lighthouse: LighthouseFixture;
}, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("../core_fixtures").BaseWorkerFixtures & {
    debuggingPort: number;
}>;
