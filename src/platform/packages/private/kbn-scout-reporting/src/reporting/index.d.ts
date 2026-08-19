import type { ReporterDescription } from 'playwright/test';
import type { ScoutPlaywrightReporterOptions } from './playwright/scout_playwright_reporter';
export * from './report';
export * from './stats';
export declare const scoutPlaywrightReporter: (options?: ScoutPlaywrightReporterOptions) => ReporterDescription;
export declare const scoutFailedTestsReporter: (options?: ScoutPlaywrightReporterOptions) => ReporterDescription;
export declare const scoutFailureSummaryReporter: (options?: ScoutPlaywrightReporterOptions) => ReporterDescription;
