import type { ServerlessProjectType } from '@kbn/es';
import type { Role } from '@kbn/test-saml-auth';
/**
 * Resolves the privileged (non-admin, elevated) role name based on the deployment environment.
 * Returns `'developer'` for serverless Elasticsearch projects, `'editor'` for all others.
 */
export declare function getPrivilegedRoleName(config: {
    serverless: boolean;
    projectType: ServerlessProjectType;
}): Role;
