import type { ToolingLog } from '@kbn/tooling-log';
import type { Config } from './configs';
/**
 * Pre-creates Elasticsearch Security indexes (.security-tokens, .security-profile)
 * by performing SAML authentication. This prevents race conditions when parallel tests
 * perform their first SAML authentication, as the security indexes will already exist.
 *
 * @param config - The server configuration containing Scout test config
 * @param log - Logger instance for logging operations
 */
export declare function preCreateSecurityIndexesViaSamlAuth(config: Config, log: ToolingLog): Promise<void>;
