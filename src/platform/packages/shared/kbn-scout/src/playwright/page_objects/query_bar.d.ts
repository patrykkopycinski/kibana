import type { ScoutPage } from '..';
/**
 * Page object for the global query text input (`queryInput`) shared by
 * Discover, Dashboard, Maps, Visualize/Lens and other apps that embed
 * `unified_search`. Covers setting and clearing the live query without
 * submitting; callers own the submit step when they need it.
 */
export declare class QueryBar {
    private readonly page;
    constructor(page: ScoutPage);
    setQuery(query: string): Promise<void>;
    getQuery(): Promise<string>;
    clearQuery(): Promise<void>;
}
