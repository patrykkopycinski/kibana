import type { ScoutPage } from '..';
export declare class HomePage {
    private readonly page;
    constructor(page: ScoutPage);
    get homeApp(): import("playwright-core").Locator;
    get manageSection(): import("playwright-core").Locator;
    get stackManagementButton(): import("playwright-core").Locator;
    goto(spaceId?: string): Promise<void>;
    getVisibleSolutions(): Promise<string[]>;
}
