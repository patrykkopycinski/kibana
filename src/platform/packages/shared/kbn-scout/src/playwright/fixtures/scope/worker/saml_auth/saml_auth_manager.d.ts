import type { SamlSessionManager } from '@kbn/test-saml-auth';
import type { Client as EsClient } from '@elastic/elasticsearch';
import type { KbnClient } from '@kbn/kbn-client';
import type { ElasticsearchRoleDescriptor, KibanaRole } from '../../../../../common/services';
import type { ScoutLogger } from '../../../../../common/services/logger';
import type { RoleSessionCredentials } from '../core_fixtures';
export declare class SamlAuthManager {
    readonly session: SamlSessionManager;
    readonly customRoleName: string;
    private readonly esClient;
    private readonly kbnClient;
    private readonly log;
    private readonly isServerless;
    private customRoleHash;
    private isCustomRoleCreated;
    constructor(session: SamlSessionManager, customRoleName: string, esClient: EsClient, kbnClient: KbnClient, log: ScoutLogger, isServerless: boolean);
    setCustomRole(role: KibanaRole | ElasticsearchRoleDescriptor): Promise<void>;
    private guardServerless;
    private getEsRoleData;
    /**
     * Provisions the worker's custom role slot with the privileges of a named ES role.
     * Use for SAML-based login (`loginWithBuiltInRole`).
     */
    setBuiltInRole(roleName: string): Promise<ElasticsearchRoleDescriptor>;
    /**
     * Fetches a named ES role's privileges filtered to API-key-safe fields.
     * Does not create a role in ES — use for inline API key descriptors.
     */
    fetchBuiltInRoleDescriptor(roleName: string): Promise<ElasticsearchRoleDescriptor>;
    asInteractiveUser(role: string | KibanaRole | ElasticsearchRoleDescriptor): Promise<RoleSessionCredentials>;
    cleanup(): Promise<void>;
}
