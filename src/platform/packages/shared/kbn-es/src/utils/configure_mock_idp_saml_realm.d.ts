import type { ToolingLog } from '@kbn/tooling-log';
export interface ConfigureMockIdpSamlRealmOptions {
    /** User-provided `-E` Elasticsearch args. */
    userEsArgs: string[];
    /** License the cluster is started with. SAML requires a `trial` (or higher) license. */
    license?: string;
    log: ToolingLog;
}
export interface ConfigureMockIdpSamlRealmResult {
    /** The Elasticsearch args to start the cluster with (SAML args prepended to user args). */
    esArgs: string[];
    /** Additional resources (e.g. `roles.yml`) to copy into the cluster's config directory. */
    resources: string[];
}
/**
 * Auto-configures a mock SAML realm so the Kibana Mock IdP works out-of-the-box, mirroring what we
 * do for snapshot-based clusters. The realm is only configured when the user hasn't already
 * provided SAML realm args via `-E` and the cluster is started with a `trial` (or higher) license.
 *
 * Returns the final Elasticsearch args (with SAML args prepended so user `-E` args can override
 * them) and any additional resources that must be copied into the cluster's config directory.
 */
export declare function configureMockIdpSamlRealm({ userEsArgs, license, log, }: ConfigureMockIdpSamlRealmOptions): Promise<ConfigureMockIdpSamlRealmResult>;
