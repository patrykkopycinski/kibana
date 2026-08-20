import type { Locator } from 'playwright/test';
import type { ScoutPage } from '..';
import type { ScoutTestConfig } from '../../types';
export declare class CollapsibleNav {
    private readonly page;
    private readonly config;
    private toggleNavButton;
    constructor(page: ScoutPage, config: ScoutTestConfig);
    expandNav(): Promise<void>;
    clickItem(itemName: 'Discover' | 'Dashboards' | 'Maps' | 'Machine Learning' | 'stack_management' | 'management:maintenanceWindows', { lowercase }?: {
        lowercase?: boolean;
    }): Promise<void>;
    getNavLinks(): Promise<string[]>;
    openMoreMenu(): Promise<void>;
    clickNavItemByDeepLinkId(deepLinkId: string): Promise<void>;
    getNavItemById(id: string): Locator;
    getNavItemByDeepLinkId(deepLinkId: string): Locator;
}
