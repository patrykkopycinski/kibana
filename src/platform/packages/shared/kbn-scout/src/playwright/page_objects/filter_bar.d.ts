import type { ScoutPage } from '..';
interface FilterCreationOptions {
    field: string;
    operator: 'is' | 'is not' | 'is one of' | 'is not one of' | 'is between' | 'exists' | 'does not exist';
    value?: string | string[] | {
        from: string;
        to: string;
    };
}
interface FilterFormOptions {
    field: string;
    operator: string;
    value?: string | string[] | {
        from: string;
        to: string;
    };
}
interface FilterStateOptions {
    field: string;
    value?: string;
    enabled?: boolean;
    pinned?: boolean;
    negated?: boolean;
}
export declare class FilterBar {
    private readonly page;
    private readonly codeEditor;
    constructor(page: ScoutPage);
    addFilter(options: FilterCreationOptions): Promise<void>;
    addDslFilter(value: string): Promise<void>;
    private fillFilterValue;
    removeAllFilters(): Promise<void>;
    removeFilter(field: string): Promise<void>;
    getFilterCount(): Promise<number>;
    hasFilter(options: FilterStateOptions): Promise<boolean>;
    toggleFilterEnabled(field: string): Promise<void>;
    toggleFilterPinned(field: string): Promise<void>;
    clickEditFilter(field: string, value: string): Promise<void>;
    getFilterEditorSelectedPhrases(): Promise<string[]>;
    closeFieldEditorModal(): Promise<void>;
    toggleFilterNegated(field: string): Promise<void>;
    hasFilterWithId(id: string, enabled?: boolean, pinned?: boolean, negated?: boolean): Promise<boolean>;
    clickEditFilterById(id: string): Promise<void>;
    getFilterEditorPreview(): Promise<string>;
    getFiltersLabel(): Promise<string[]>;
    addAndFilter(path: string): Promise<void>;
    addOrFilter(path: string): Promise<void>;
    openFilterBuilder(): Promise<void>;
    saveAndCloseFilterBuilder(): Promise<void>;
    /**
     * Fill a filter form at a given path inside the filter builder.
     * Mirrors the FTR `filterBar.createFilter` / `pasteFilterData` for leaf filters.
     */
    fillFilterForm(path: string, options: FilterFormOptions): Promise<void>;
}
export {};
