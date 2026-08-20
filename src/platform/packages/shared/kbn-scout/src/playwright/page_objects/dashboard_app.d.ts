import type { ScoutPage } from '..';
type CommonlyUsedTimeRange = 'Today' | 'Last_15 minutes' | 'Last_1 hour' | 'Last_24 hours' | 'Last_30 days' | 'Last_90 days' | 'Last_1 year';
interface TimeoutOptions {
    timeout?: number;
}
export declare class DashboardApp {
    private readonly page;
    private readonly renderable;
    private readonly toasts;
    private readonly settingsFlyout;
    private readonly settingsButton;
    private readonly editModeButton;
    private readonly viewOnlyModeButton;
    private readonly dashboardViewport;
    private readonly embeddablePanel;
    private readonly controlsGroup;
    private readonly controlFrame;
    private readonly optionsListControlSearchInput;
    private readonly tryEsqlLink;
    private readonly addTopNavButton;
    private readonly panelSelectionFlyout;
    private readonly panelSelectionSearchInput;
    private readonly saveModal;
    private readonly savedObjectTitleInput;
    private readonly confirmSaveButton;
    private readonly quickSaveSecondaryButton;
    private readonly interactiveSaveMenuItem;
    private readonly savedObjectsFinderTable;
    private readonly savedObjectFinderLoadingIndicator;
    private readonly savedObjectFinderSearchInput;
    private readonly addEmbeddableSuccess;
    private readonly markdownEditorApplyButton;
    private readonly markdownRenderer;
    private readonly applyFlyoutButton;
    private readonly visualizeSaveAndReturnButton;
    private readonly drilldownWizardSubmit;
    private readonly customizePanelFlyout;
    private readonly customizePanelSaveButton;
    private readonly customizePanelCancelButton;
    private readonly customizePanelTimeRangeQuickMenuButton;
    constructor(page: ScoutPage);
    goto(): Promise<void>;
    openDashboardWithId(id: string, opts?: {
        waitForRender?: boolean;
    }): Promise<void>;
    /** Navigates to the new dashboard creation page and waits for the editor toolbar to load. */
    openNewDashboard(options?: TimeoutOptions): Promise<void>;
    openTryEsqlDashboard(): Promise<void>;
    private getSettingsFlyout;
    openSettingsFlyout(): Promise<void>;
    toggleSyncColors(value: boolean): Promise<void>;
    applyDashboardSettings(): Promise<void>;
    /**
     * Checks if the dashboard is in view mode.
     */
    getIsInViewMode(): Promise<boolean>;
    /**
     * Switches the dashboard to edit mode.
     */
    switchToEditMode(): Promise<void>;
    /**
     * Opens a dashboard by saved object id in edit mode via URL state.
     * Prefer this over the listing-page link when tests may end in the Lens editor.
     */
    openDashboardWithIdInEditMode(id: string): Promise<void>;
    private waitForEditModeActive;
    /**
     * Clicks the cancel button to exit edit mode without saving.
     */
    clickCancelOutOfEditMode(): Promise<void>;
    ensureViewMode(): Promise<void>;
    /**
     * Ensures the dashboard is in edit mode, switching from view mode if necessary.
     * Useful after flows (e.g. saving an ES|QL viz from Discover) that already
     * leave the dashboard in edit mode and therefore have no Edit button to click.
     */
    ensureEditMode(): Promise<void>;
    /**
     * Opens the "Add panel" flyout for selecting panel types to add to the dashboard.
     */
    openAddPanelFlyout(options?: TimeoutOptions): Promise<void>;
    saveDashboard(name: string, options?: TimeoutOptions): Promise<void>;
    confirmSaveModal(options?: TimeoutOptions): Promise<void>;
    private clickAppMenuItem;
    saveChangesToExistingDashboard(): Promise<void>;
    addPanelFromLibrary(...names: string[]): Promise<void>;
    clickQuickSave(): Promise<void>;
    clearUnsavedChanges(): Promise<void>;
    /**
     * Opens the "Add from library" flyout.
     */
    openLibraryFlyout(options?: TimeoutOptions): Promise<void>;
    /**
     * Closes the library flyout.
     */
    closeLibraryFlyout(): Promise<void>;
    /**
     * Searches and filters embeddables in the library flyout.
     * Uses Playwright's native type() to fire proper keyboard events.
     *
     * @param embeddableName - Name with dashes (e.g., 'Rendering-Test:-saved-search')
     * @param embeddableType - Optional type filter (e.g., 'search', 'Visualization')
     * @param options - Optional timeout overrides
     */
    private filterEmbeddableNames;
    /**
     * Core method to add an embeddable from the library.
     *
     * @param embeddableName - Name with dashes (e.g., 'Rendering-Test:-saved-search')
     * @param embeddableType - Optional type filter (e.g., 'search', 'Visualization')
     * @param options - Optional timeout overrides
     */
    addEmbeddable(embeddableName: string, embeddableType?: string, options?: TimeoutOptions): Promise<void>;
    /**
     * Adds a saved search to the dashboard.
     * Wrapper around addEmbeddable() with type='search'.
     *
     * @param searchName - Name with dashes (e.g., 'Rendering-Test:-saved-search')
     * @param options - Optional timeout overrides
     */
    addSavedSearch(searchName: string, options?: TimeoutOptions): Promise<void>;
    /**
     * Adds a Lens visualization to the dashboard from the library.
     * Wrapper around addEmbeddable() with type='lens'.
     *
     * @param lensName - Name of the Lens saved object
     * @param options - Optional timeout overrides
     */
    addLens(lensName: string, options?: TimeoutOptions): Promise<void>;
    /**
     * Adds a new Markdown panel (by value) to the dashboard.
     *
     * @param content - Markdown content to save
     */
    addMarkdownPanel(content: string): Promise<void>;
    addMapPanel(): Promise<void>;
    customizePanel(options: {
        name: string;
        customTimeRageCommonlyUsed?: {
            value: CommonlyUsedTimeRange;
        };
    }): Promise<void>;
    removePanel(name: string | 'embeddableError'): Promise<void>;
    waitForPanelsToLoad(expectedCount: number, options?: {
        timeout: number;
        selector: string;
    }): Promise<void>;
    /**
     * Gets the titles of all panels on the dashboard
     */
    getPanelTitles(): Promise<string[]>;
    getPanelTitlesLocator(): import("playwright-core").Locator;
    /**
     * Gets the count of panels on the dashboard
     * Returns the count of *visible* embeddable panels on the dashboard. Hidden panels
     * (e.g. those occluded when another panel is maximized) remain in the DOM.
     */
    getPanelCount(): Promise<number>;
    getControlsGroupLocator(): import("playwright-core").Locator;
    getControlFramesLocator(): import("playwright-core").Locator;
    getDashboardControlsLocator(): import("playwright-core").Locator;
    getControlFrameLocator(controlId: string): import("playwright-core").Locator;
    getControlIds(): Promise<string[]>;
    getOnlyControlId(): Promise<string>;
    /**
     * Gets the count of dashboard controls
     */
    getControlCount(): Promise<number>;
    removeControl(controlId: string): Promise<void>;
    optionsListOpenPopover(controlId: string): Promise<void>;
    optionsListPopoverSelectOption(availableOption: string): Promise<void>;
    getSavedSearchRowCount(): Promise<number>;
    getTagCloudTexts(): Promise<string[][]>;
    getSharedItemsCount(): Promise<number>;
    getAddPanelFlyoutGroups(): Promise<string[]>;
    getAddPanelFlyoutActions(): Promise<string[]>;
    /**
     * Waits for all dashboard controls and panels to finish rendering.
     * Uses the data-render-complete attribute to determine panel rendering completion.
     */
    waitForRenderComplete(): Promise<void>;
    private waitForControlsReady;
    private readonly customTimeRangeToggleTestSubj;
    private waitForCustomTimeRangeToggleState;
    private getCustomizePanelFlyout;
    enableCustomTimeRange(): Promise<void>;
    disableCustomTimeRange(): Promise<void>;
    openDatePickerQuickMenu(): Promise<void>;
    clickCommonlyUsedTimeRange(timeRange: CommonlyUsedTimeRange): Promise<void>;
    openCustomizePanel(title?: string): Promise<void>;
    closeCustomizePanel(): Promise<void>;
    getCustomPanelTitle(): Promise<string>;
    setCustomPanelTitle(customTitle: string): Promise<void>;
    resetCustomPanelTitle(): Promise<void>;
    getResetCustomPanelTitleButton(): import("playwright-core").Locator;
    getCustomPanelDescription(): Promise<string>;
    setCustomPanelDescription(customDescription: string): Promise<void>;
    resetCustomPanelDescription(): Promise<void>;
    getResetCustomPanelDescriptionButton(): import("playwright-core").Locator;
    saveCustomizePanel(): Promise<void>;
    expectTimeRangeBadgeExists(): Promise<void>;
    expectTimeRangeBadgeMissing(): Promise<void>;
    expectEmptyPlaceholderVisible(): Promise<void>;
    expectXYVisChartVisible(): Promise<void>;
    clickTimeRangeBadge(): Promise<void>;
    /**
     * Formats a panel title for use in test subject selectors.
     */
    private formatTitleForTestSubj;
    /**
     * Gets the hover actions wrapper for a panel by title.
     *
     * @param title - Panel title. If empty, finds first panel by class.
     */
    getPanelHoverActionsLocator(title?: string): import("playwright-core").Locator;
    /**
     * Opens the context menu for a panel.
     * Scrolls the panel into view and clicks the menu toggle.
     */
    openPanelContextMenu(title?: string): Promise<void>;
    navigateToLensEditorFromPanel(title?: string): Promise<void>;
    /**
     * Checks if a panel action exists as a descendant of the panel wrapper.
     */
    private panelActionExistsInWrapper;
    /**
     * Clicks a panel action from the hover actions or context menu.
     *
     * Key difference from before: checks if action is DESCENDANT of panel wrapper,
     * not just globally visible. This prevents clicking wrong panel's actions.
     */
    clickPanelAction(actionTestSubj: string, title?: string): Promise<void>;
    /**
     * Clones a panel on the dashboard.
     * The cloned panel becomes a "by value" panel (not linked to library).
     */
    clonePanel(title?: string): Promise<void>;
    /**
     * Unlinks a panel from the library, converting it to a "by value" panel.
     * Unlinks a panel from the library and verifies it is unlinked.
     */
    unlinkFromLibrary(title?: string): Promise<void>;
    /**
     * Saves a panel to the library with a new title.
     * Saves a panel to the library and verifies it is linked.
     */
    saveToLibrary(newTitle: string, currentTitle?: string): Promise<void>;
    /**
     * Checks if a panel has a specific action available.
     * Checks both hover actions and context menu.
     *
     * Uses count() > 0 to include hidden elements.
     * (finds elements even if not visible).
     */
    panelHasAction(actionTestSubj: string, title?: string): Promise<boolean>;
    /**
     * Asserts that a panel action exists (throws if not found).
     */
    expectExistsPanelAction(actionTestSubj: string, title?: string): Promise<void>;
    /**
     * Verifies a panel is linked to the library.
     * A linked panel has the "Unlink from library" action available.
     *
     * Switches to edit mode before checking because library actions
     * may not be available in view mode.
     */
    expectLinkedToLibrary(title?: string): Promise<void>;
    /**
     * Verifies a panel is NOT linked to the library.
     * A non-linked panel has the "Save to library" action available.
     *
     * Switches to edit mode before checking because library actions
     * may not be available in view mode.
     */
    expectNotLinkedToLibrary(title?: string): Promise<void>;
    openInlineEditor(id: string): Promise<void>;
    /**
     * Returns locator for a specific panel by embeddable id.
     */
    getPanelByEmbeddableId(id: string): import("playwright-core").Locator;
    addNewLensPanel(): Promise<void>;
    addNewESQLPanel(): Promise<void>;
    /** Opens the add-panel flyout, selects the given panel type, and waits for the flyout to close. */
    addNewPanel(panelType: string): Promise<void>;
    /** Clicks "Apply and close" in the ES|QL editor flyout to commit the query to the panel. */
    applyAndCloseESQLPanel(): Promise<void>;
    /** Clicks the "Save and return" button in the legacy Visualize editor. */
    clickVisualizeSaveAndReturn(): Promise<void>;
    /** Navigates to a dashboard by clicking its title link on the listing page. */
    clickDashboardTitleLink(dashboardTitle: string): Promise<void>;
    /**
     * Opens the "Save as..." dialog via the quick-save dropdown,
     * fills in the new title, and confirms.
     */
    saveDashboardAsCopy(dashboardTitle?: string): Promise<void>;
    /** Selects a drilldown trigger and submits the drilldown wizard. */
    selectDrilldownTriggerAndSubmit(trigger: 'on_click_value' | 'on_select_range' | 'on_open_panel_menu'): Promise<void>;
    expectPanelCount(expectedCount: number): Promise<void>;
    getDashboardListingLink(title: string): import("playwright-core").Locator;
    getAppTitle(): import("playwright-core").Locator;
    enterFullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
    /**
     * Toggles the expand/minimize state of a panel. Use this for symmetric flows
     * (expand then minimize) that should not assert an end state. For one-way
     * expansion that asserts the maximized layout, use `maximizePanel`.
     */
    togglePanelExpand(title?: string): Promise<void>;
    maximizePanel(title?: string): Promise<void>;
    createUrlDrilldown(name: string, url: string, trigger?: 'on_click_value' | 'on_select_range' | 'on_open_panel_menu'): Promise<void>;
    setDashboardTitle(title: string): Promise<void>;
    setDashboardDescription(description: string): Promise<void>;
}
export {};
