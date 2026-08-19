/**
 * Parsed URL pieces for test server endpoints.
 * Duplicated from @kbn/test `UrlParts` so Scout typings do not import @kbn/test.
 */
export interface UrlParts {
    protocol?: string;
    hostname?: string;
    port?: number;
    auth?: string;
    username?: string;
    password?: string;
}
