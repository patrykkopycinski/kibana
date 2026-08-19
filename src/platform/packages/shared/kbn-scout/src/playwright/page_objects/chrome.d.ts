import type { Locator } from 'playwright/test';
import type { ScoutPage } from '..';
export declare class Chrome {
    private readonly page;
    readonly layoutNavigation: Locator;
    readonly primaryNavigation: Locator;
    readonly primaryNavigationItems: Locator;
    readonly pageTitle: Locator;
    readonly logo: Locator;
    readonly searchInput: Locator;
    readonly searchNoResults: Locator;
    private readonly nextChromeHeader;
    private readonly searchButton;
    constructor(page: ScoutPage);
    isNextChrome(): Promise<boolean>;
    clickLogo(): Promise<void>;
    openSearch(): Promise<void>;
    search(term: string): Promise<void>;
    getSearchOptionByUrl(url: string): Locator;
    navItemInPrimaryById(id: string): Locator;
    badgeWithLabel(label: string): Locator;
}
