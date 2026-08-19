import type { Page, TestInfo } from '@playwright/test';
export declare const collectBrowserConsoleErrors: (page: Page) => string[];
export declare const attachBrowserConsoleErrors: (testInfo: TestInfo, errors: string[]) => Promise<void>;
