import type { Locator } from '@playwright/test';
import type { ScoutPage } from '../fixtures/scope/test/scout_page';
export type SelectorInput = string | {
    dataTestSubj: string;
} | {
    locator: string;
};
/**
 * Creates a Playwright locator based on the selector input type.
 * Supports:
 * - string: treated as 'dataTestSubj' for backward compatibility
 * - { dataTestSubj: string }: explicit data-test-subj selector
 * - { locator: string }: any valid Playwright locator (CSS, XPath, role, text, etc.)
 */
export declare function resolveSelector(page: ScoutPage, selector: SelectorInput): Locator;
