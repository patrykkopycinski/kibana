import type { ScoutPage } from '..';
export declare class ListingTable {
    private readonly page;
    private readonly table;
    private readonly searchBox;
    constructor(page: ScoutPage);
    waitUntilTableIsLoaded(options?: {
        timeout?: number;
    }): Promise<void>;
    getAllItemsNames(): Promise<string[]>;
    searchFor(text: string): Promise<void>;
    selectFilterTags(...tagNames: string[]): Promise<void>;
    /**
     * Filters the listing by the given title. Wraps `title` in quotes so that
     * names containing special characters (e.g. `"(1)"`) are matched literally rather
     * than tokenized by the saved-object search syntax.
     */
    searchForItemTitle(title: string): Promise<void>;
    clearSearchFilter(): Promise<void>;
}
