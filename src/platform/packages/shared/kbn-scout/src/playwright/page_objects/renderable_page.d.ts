import type { ScoutPage } from '..';
export declare class RenderablePage {
    private readonly page;
    constructor(page: ScoutPage);
    waitForRender(count?: number): Promise<void>;
}
