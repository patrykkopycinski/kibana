import type { Locator } from '@playwright/test';
import type { ScoutPage } from '..';
/**
 * URL-state shape for a Content List listing page. Mirrors the keys handled by
 * `kbn-content-list-provider` URL sync (`q` and `sort`).
 */
export interface ContentListUrlState {
    /** Free-text query (the `q` URL param). */
    q?: string;
    /** Sort spec, e.g. `'title:asc'` (the `sort` URL param). */
    sort?: string;
}
/**
 * Builds the URL search string (including a leading `?`) for a Content List
 * page given a partial `ContentListUrlState`. Returns an empty string when no
 * params are set, so it can be appended unconditionally to a hash route.
 *
 * Mirrors `kbn-content-list-provider`'s RFC 3986–friendly encoding so colons,
 * commas, parens, etc. stay readable.
 *
 * @example
 *   buildContentListSearch({ q: 'Alpha', sort: 'title:desc' })
 *   // => '?q=Alpha&sort=title:desc'
 */
export declare const buildContentListSearch: (params: ContentListUrlState) => string;
/**
 * Builds a `RegExp` matching the URL of a Content List listing page anchored
 * at the given hash route. Useful with `expect(page).toHaveURL(...)` to assert
 * the `kbn-content-list-provider` URL contract — i.e. `q` and `sort` end up in
 * the URL in the expected shape after the listing rewrites.
 *
 * @param hash - Hash route the listing is mounted at (e.g. `'#/home'`).
 * @param params - Expected URL state (`q`, `sort`).
 *
 * @example
 *   await expect(page).toHaveURL(buildContentListUrlRegex('#/home', { q: 'Alpha' }));
 */
export declare const buildContentListUrlRegex: (hash: string, params: ContentListUrlState) => RegExp;
/**
 * Page-object wrapper for the `@kbn/content-list` listing UI (toolbar, table,
 * selection bar). Centralizes the `data-test-subj` selectors emitted by the
 * Content List packages so plugin tests don't have to re-derive them.
 *
 * Compose this in a plugin page object — it intentionally does not own
 * navigation, since each consuming app mounts the listing under a different
 * route and may surface app-specific buttons (e.g. an empty-prompt CTA).
 *
 * @example
 *   class GraphListingPage {
 *     readonly contentList: ContentListWrapper;
 *
 *     constructor(private readonly page: ScoutPage) {
 *       this.contentList = new ContentListWrapper(page);
 *     }
 *
 *     async goto() {
 *       await this.page.gotoApp('graph');
 *       await this.contentList.waitForReady();
 *     }
 *   }
 */
export declare class ContentListWrapper {
    private readonly page;
    readonly pageHeader: Locator;
    readonly toolbar: Locator;
    readonly searchBox: Locator;
    readonly clearSearchButton: Locator;
    readonly sortFilterButton: Locator;
    readonly tagsFilterButton: Locator;
    readonly createdByFilterButton: Locator;
    readonly favoritesFilterButton: Locator;
    readonly itemLinks: Locator;
    readonly noResultsPanel: Locator;
    readonly tableSelectAllCheckbox: Locator;
    readonly selectionBarDeleteButton: Locator;
    readonly deleteConfirmButton: Locator;
    constructor(page: ScoutPage);
    /** Wait for the listing page header to render — a stable readiness signal. */
    waitForReady(): Promise<void>;
    /**
     * Type characters into the toolbar search box one at a time. Mirrors
     * real-user input so `EuiSearchBar`'s controlled `onChange` fires
     * incrementally.
     */
    typeIntoSearch(text: string): Promise<void>;
    /** Replace the search box value (no Enter; commit happens on debounce). */
    setSearch(text: string): Promise<void>;
    /**
     * Replace the search box value and submit with Enter. Mirrors the typical
     * "search and apply" flow surfaced by `EuiSearchBar`.
     */
    searchFor(text: string): Promise<void>;
    /** Clear the search box via its built-in clear-input button. */
    clearSearch(): Promise<void>;
    /** Open the sort filter popover and select the option with the given label. */
    selectSortOption(label: string): Promise<void>;
    /**
     * Open the tags filter popover and select the option for the given tag name.
     *
     * The subject is derived inline to mirror `getContentListTagOptionSubj` from
     * `@kbn/content-list-common`; it isn't imported because `@kbn/scout` is on the
     * Scout selective-testing critical path and must not depend on that package.
     */
    selectTag(name: string): Promise<void>;
    /** Select all items via the table header checkbox and confirm the bulk-delete dialog. */
    selectAllAndDelete(): Promise<void>;
}
