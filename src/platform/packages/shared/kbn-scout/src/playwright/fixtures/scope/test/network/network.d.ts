import type { Request } from '@playwright/test';
import type { ScoutPage } from '../scout_page';
interface MatchOptions {
    endpoint: string;
    method?: string;
    exactPathname?: boolean;
}
export declare class Network {
    private readonly page;
    constructor(page: ScoutPage);
    matchesEndpoint(request: Request, options: MatchOptions): boolean;
    trackMatchingRequests(options: MatchOptions, action: (getCount: () => number) => Promise<void>): Promise<number>;
    countMatchingRequests(matchOptions: MatchOptions, action: () => Promise<void>): Promise<number>;
}
export {};
