import type { Locator } from 'playwright/test';
import type { ScoutPage } from '..';
export declare class DataViewsManagementPage {
    private readonly page;
    readonly createButton: Locator;
    readonly headerBadge: Locator;
    readonly table: Locator;
    private readonly noDataViewsPrompt;
    constructor(page: ScoutPage);
    /** Navigates to the data views management page and waits for it to be ready. */
    goto(): Promise<void>;
    /** Clicks the create button and waits for the editor flyout to open. */
    openCreateWizard(): Promise<void>;
    /** Waits for the empty-state prompt (no data views exist). */
    waitForListingPage(): Promise<void>;
    /** Waits for the data views table to appear (at least one data view exists). */
    waitForTableLoaded(): Promise<void>;
    /**
     * Returns the locator for a space avatar inside the data views table.
     * Scoping to the table avoids matching the Kibana nav header avatar.
     */
    spaceAvatarInTable(spaceId: string): Locator;
    /**
     * Clicks the space avatar for the given space in the data views table to open the
     * "Share to space" flyout, then waits for the flyout to be visible before returning.
     */
    openShareToSpaceFlyout(spaceId: string): Promise<void>;
    /** Selects a space by ID in the open "Share to space" flyout. */
    selectSpaceInFlyout(spaceId: string): Promise<void>;
    /** Saves the "Share to space" flyout and waits for it to close. */
    saveShareToSpaceFlyout(): Promise<void>;
}
