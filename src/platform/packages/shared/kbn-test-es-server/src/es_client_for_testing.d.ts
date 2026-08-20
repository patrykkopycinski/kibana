import type { ClientOptions } from '@elastic/elasticsearch/lib/client';
import type { Client as EsClient } from '@elastic/elasticsearch';
/** options for creating es instances used in functional testing scenarios */
export interface EsClientForTestingOptions extends Omit<ClientOptions, 'node' | 'nodes' | 'tls'> {
    /** url of es instance */
    esUrl: string;
    /** overwrite the auth embedded in the url to use a different user in this client instance */
    authOverride?: {
        username: string;
        password: string;
    };
    /**
     * are we running tests against cloud? this is automatically determined
     * by checking for the TEST_CLOUD environment variable but can be overriden
     * for special cases
     */
    isCloud?: boolean;
}
export declare function createEsClientForTesting(options: EsClientForTestingOptions): EsClient;
