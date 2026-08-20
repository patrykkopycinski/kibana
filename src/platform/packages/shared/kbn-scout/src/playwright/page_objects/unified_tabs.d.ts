import type { Locator } from '../../..';
import type { ScoutPage } from '..';
/**
 * Test-subject prefixes used by the Unified Tabs component.
 */
export declare const UNIFIED_TABS_TEST_SUBJ: {
    readonly selectTabBtnPrefix: 'unifiedTabs_selectTabBtn_';
    readonly closeTabBtnPrefix: 'unifiedTabs_closeTabBtn_';
    readonly tabMenuBtnPrefix: 'unifiedTabs_tabMenuBtn_';
    readonly editTabLabelInputPrefix: 'unifiedTabs_editTabLabelInput_';
    readonly newTabBtn: 'unifiedTabs_tabsBar_newTabBtn';
    readonly tabsBar: 'unifiedTabs_tabsBar';
    readonly tabsBarMenuButton: 'unifiedTabs_tabsBarMenuButton';
    readonly tabsBarMenuPanel: 'unifiedTabs_tabsBarMenuPanel';
    readonly duplicateMenuItem: 'unifiedTabs_tabMenuItem_duplicate';
    readonly inspectMenuItem: 'unifiedTabs_tabMenuItem_inspect';
    readonly clearRecentlyClosed: 'unifiedTabs_tabsMenu_clearRecentlyClosed';
    readonly restoreAllRecentlyClosedTabs: 'unifiedTabs_tabsMenu_restoreAllTabs';
    readonly tabPreviewOuterPanelPrefix: 'unifiedTabs_tabPreview_outerPanel_';
    readonly tabPreviewContentPanel: 'unifiedTabs_tabPreview_contentPanel';
    readonly tabPreviewTitlePrefix: 'unifiedTabs_tabPreview_title_';
    readonly tabPreviewQueryPrefix: 'unifiedTabs_tabPreviewCodeBlock_';
    readonly tabPreviewLabelPrefix: 'unifiedTabs_tabPreview_label_';
    readonly recentlyClosedTabPrefix: 'unifiedTabs_tabsMenu_recentlyClosedTab_';
    readonly recentlyClosedGroupPrefix: 'unifiedTabs_tabsMenu_recentlyClosedGroup_';
    readonly recentlyClosedGroupTabPrefix: 'unifiedTabs_tabsMenu_recentlyClosedGroupTab_';
};
export interface TabPreviewContent {
    title: string;
    query: string;
    label: string;
}
export declare class UnifiedTabs {
    private readonly page;
    constructor(page: ScoutPage);
    /** Locator for the unified-tabs tab bar. */
    private getTabsBar;
    /** Locator matching every tab button in the unified tab bar. */
    getTabs(): Locator;
    isTabsBarVisible(): Promise<boolean>;
    private getTabWrapper;
    getTabUnsavedIndicator(index: number): Promise<Locator>;
    private getTab;
    /**
     * Locator for the currently selected tab in the unified tabs bar.
     */
    private get activeTabLocator();
    /**
     * Navigates to a tab by its visible label text and waits for it to become active.
     */
    navigateToTabByName(name: string): Promise<void>;
    getTabLabels(): Promise<string[]>;
    getSelectedTabLabel(): Promise<string>;
    /**
     * Dismisses the hover tab-preview panel. The preview is a portal that overlays
     * the area below the tab bar (e.g. the data-view switcher) and intercepts
     * pointer events, so a following click can fail with the preview "subtree
     * intercepts pointer events".
     */
    hideTabPreview(): Promise<void>;
    openTabPreview(index: number): Promise<void>;
    private getVisibleTabPreviewPanel;
    private getVisibleTabPreviewText;
    getTabPreviewContent(index: number): Promise<TabPreviewContent>;
    /**
     * Switches to the tab at the given 0-based index and waits for it to become active.
     * Does NOT wait for content to load — consumers should call their own
     * content-loading waiter after this if needed.
     */
    selectTab(index: number): Promise<void>;
    editTabLabel(index: number, newLabel: string): Promise<void>;
    /**
     * Clicks the "New tab" button without waiting for the new tab to settle.
     * Prefer `createNewTab()` for the common case; use this only when a test
     * intentionally opens several tabs in quick succession (rapid-open race).
     */
    clickNewTabButton(): Promise<void>;
    /**
     * Clicks the "New tab" button and waits for the newly created tab to become
     * the active one.
     */
    createNewTab(): Promise<void>;
    private openTabsBarMenu;
    private closeTabsBarMenu;
    private getRecentlyClosedTabs;
    private getRecentlyClosedGroups;
    private getRecentlyClosedGroupTabs;
    private getRecentlyClosedRootItems;
    private getRecentlyClosedItemTitles;
    private getRecentlyClosedItemTexts;
    getRecentlyClosedTabLabels(): Promise<string[]>;
    getRecentlyClosedTabTexts(): Promise<string[]>;
    getRecentlyClosedRootTitles(): Promise<string[]>;
    getRecentlyClosedGroupTabTitles(groupIndex: number): Promise<string[]>;
    clearRecentlyClosedTabs(): Promise<void>;
    closeTab(index: number): Promise<void>;
    restoreRecentlyClosedTab(index: number): Promise<void>;
    restoreRecentlyClosedTabFromGroup(groupIndex: number, tabIndex: number): Promise<void>;
    restoreAllRecentlyClosedTabsFromGroup(groupIndex: number): Promise<void>;
    /**
     * Returns the `data-test-subj` of the currently selected tab
     * (e.g. `unifiedTabs_selectTabBtn_<id>`). Useful for capturing a tab id
     * before navigating away so it can be restored later by test-subj.
     */
    getActiveTabTestSubj(): Promise<string>;
    /**
     * Switches to the tab identified by the given full
     * `unifiedTabs_selectTabBtn_<id>` test subject and waits for it to become
     * the active tab.
     */
    navigateToTabByTestSubj(testSubj: string): Promise<void>;
    private clickActiveTabMenuItem;
    openInspectorForActiveTab(): Promise<void>;
    /**
     * Opens the tab menu for the tab identified by its full
     * `unifiedTabs_selectTabBtn_<id>` test subject, clicks "Duplicate", and waits
     * for a new active tab (a different test subject) to appear.
     */
    private duplicateTabByTestSubj;
    /**
     * Duplicates the currently active tab via its tab menu.
     * The duplicated tab becomes the active one; this helper waits for the
     * active-tab marker to move to a different test subject before returning.
     */
    duplicateActiveTab(): Promise<void>;
    /**
     * Duplicates the tab at the given 0-based index via its tab menu.
     * The duplicated tab becomes the active one.
     */
    duplicateTab(index: number): Promise<void>;
}
