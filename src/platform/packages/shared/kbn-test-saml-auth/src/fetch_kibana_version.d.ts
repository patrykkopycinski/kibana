import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Fetches Kibana version string in the same shape as @kbn/kbn-client KbnClientVersion.get()
 * (for use as the `kbn-version` header on SAML requests). Single GET to `/api/status`; no retries.
 */
export declare function fetchKibanaVersionHeaderString(kbnBaseUrl: string, username: string, password: string, log: ToolingLog): Promise<string>;
