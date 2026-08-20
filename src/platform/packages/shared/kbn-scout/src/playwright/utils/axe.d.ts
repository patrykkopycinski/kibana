import type { Page } from '@playwright/test';
export interface RunA11yScanOptions {
    /** Optional CSS selectors to include in analysis */
    include?: string[];
    /** Optional CSS selectors to exclude from analysis */
    exclude?: string[];
    /** Timeout in ms for the scan (defaults 10000) */
    timeoutMs?: number;
}
export declare const checkA11y: (page: Page, options?: RunA11yScanOptions) => Promise<{
    violations: string[];
}>;
