import type { ScoutTestConfig } from '../../types';
import type { ScoutLogger } from './logger';
export interface PathOptions {
    /**
     * Query string parameters
     */
    params?: Record<string, string>;
    /**
     * The hash value of the URL
     */
    hash?: string;
}
export declare class KibanaUrl {
    #private;
    constructor(baseUrl: URL);
    /**
     * Get an absolute URL based on Kibana's URL
     * @param rel relative url, resolved relative to Kibana's url
     * @param options optional modifications to apply to the URL
     */
    get(rel?: string, options?: PathOptions): string;
    domain(): string;
    /**
     * Get the URL for an app
     * @param appName name of the app to get the URL for
     * @param options optional modifications to apply to the URL
     */
    app(appName: string, options?: {
        space?: string;
        pathOptions?: PathOptions;
    }): string;
    toString(): string;
}
export declare function createKbnUrl(scoutConfig: ScoutTestConfig, log: ScoutLogger): KibanaUrl;
