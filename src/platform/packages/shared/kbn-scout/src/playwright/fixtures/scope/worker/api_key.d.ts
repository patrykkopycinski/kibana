import type { ApiClientFixture } from './api_client';
import type { DefaultRolesFixture } from './default_roles';
import type { ElasticsearchRoleDescriptor, KibanaRole } from '../../../../common';
export interface ApiKey {
    id: string;
    name: string;
    api_key: string;
    encoded: string;
}
export interface ApiKeyHeader {
    [Authorization: string]: string;
}
export interface RoleApiCredentials {
    apiKey: ApiKey;
    apiKeyHeader: ApiKeyHeader;
}
export interface RequestAuthFixture {
    /**
     * Creates an API key for a predefined role (e.g. 'admin', 'viewer', 'editor').
     * Role privileges are resolved from the corresponding roles.yml file.
     * @param role - The predefined role name.
     */
    getApiKey: (role: string) => Promise<RoleApiCredentials>;
    /**
     * Creates an API key for a custom role defined inline via a Kibana or Elasticsearch
     * role descriptor. The role is created on-the-fly and cleaned up after the worker completes.
     * @param role - A Kibana or Elasticsearch role descriptor with specific permissions.
     */
    getApiKeyForCustomRole: (role: KibanaRole | ElasticsearchRoleDescriptor) => Promise<RoleApiCredentials>;
    /**
     * Shorthand for `getApiKey('admin')`.
     * Creates an API key with administrative privileges.
     */
    getApiKeyForAdmin: () => Promise<RoleApiCredentials>;
    /**
     * Shorthand for `getApiKey('viewer')`.
     * Creates an API key with viewer-only permissions.
     */
    getApiKeyForViewer: () => Promise<RoleApiCredentials>;
    /**
     * Creates an API key for a non-admin user with elevated privileges.
     * Resolves the role based on the environment: `developer` for serverless
     * Elasticsearch projects, `editor` for all other deployments and project types.
     */
    getApiKeyForPrivilegedUser: () => Promise<RoleApiCredentials>;
    /**
     * Fetches the descriptor of the named ES role and creates an API key scoped
     * to those privileges. Works for built-in ES roles (e.g. `'kibana_admin'`,
     * `'superuser'`) without requiring an entry in `roles.yml`.
     *
     * The descriptor is embedded inline in the API key — no separate role is
     * created in Elasticsearch.
     *
     * @example
     * const { apiKeyHeader } = await requestAuth.getApiKeyForBuiltInRole('kibana_admin');
     */
    getApiKeyForBuiltInRole: (roleName: string) => Promise<RoleApiCredentials>;
}
export declare const requestAuthFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("./core_fixtures").BaseWorkerFixtures & {
    samlAuth: import("./saml_auth").SamlAuth;
} & {
    requestAuth: RequestAuthFixture;
    defaultRoles: DefaultRolesFixture;
    apiClient: ApiClientFixture;
}>;
