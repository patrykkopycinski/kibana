/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SamlSessionManager } from '@kbn/test-saml-auth';
import type { ElasticsearchRoleDescriptor, KibanaRole } from '../../../../../common/services';
import type { RoleSessionCredentials, BaseWorkerFixtures } from '../core_fixtures';
export interface SamlAuth {
  session: SamlSessionManager;
  customRoleName: string;
  setCustomRole(role: KibanaRole | ElasticsearchRoleDescriptor): Promise<void>;
  /**
   * Fetches the live descriptor of any named ES role and provisions it as the
   * worker's custom role slot. Works for built-in ES roles (e.g. `kibana_admin`,
   * `superuser`) and any other role present in Elasticsearch.
   *
   * Works on both local and Cloud because it delegates entirely to `setCustomRole`,
   * which already supports Cloud.
   *
   * @param roleName - The name of the role to look up in Elasticsearch.
   */
  setBuiltInRole(roleName: string): Promise<ElasticsearchRoleDescriptor>;
  /**
   * Fetches the privilege descriptor of a named ES role filtered to fields
   * accepted by the API key `role_descriptors` endpoint. Does **not** create
   * a role in Elasticsearch — use this when building an inline API key.
   */
  fetchBuiltInRoleDescriptor(roleName: string): Promise<ElasticsearchRoleDescriptor>;
  /**
   * Generates a SAML session cookie for an interactive user with the specified role.
   *
   * This method is ideal for testing internal APIs that are typically accessed via the UI.
   * It authenticates as an interactive user and returns session credentials including cookie
   * headers that can be used in API requests.
   *
   * @param role - Either a built-in Kibana role name (e.g., 'admin', 'editor', 'viewer') or
   *               a custom role descriptor with specific permissions (Kibana or Elasticsearch)
   * @returns Promise resolving to credentials with cookieValue and cookieHeader properties
   *
   * @example
   * // Using a built-in role
   * const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
   * const response = await apiClient.get('internal/endpoint', {
   *   headers: { ...cookieHeader }
   * });
   *
   * @example
   * // Using a custom role descriptor
   * const customRole = {
   *   kibana: [{ base: ['read'], spaces: ['*'] }],
   *   elasticsearch: { indices: [{ names: ['logs-*'], privileges: ['read'] }] }
   * };
   * const { cookieHeader } = await samlAuth.asInteractiveUser(customRole);
   * const response = await apiClient.get('internal/endpoint', {
   *   headers: { ...cookieHeader }
   * });
   */
  asInteractiveUser(
    role: string | KibanaRole | ElasticsearchRoleDescriptor
  ): Promise<RoleSessionCredentials>;
}
/**
 * Full worker fixture set: base fixtures + samlAuth.
 * Use this type when you need to reference the complete worker fixture surface.
 */
export interface CoreWorkerFixtures extends BaseWorkerFixtures {
  samlAuth: SamlAuth;
}
export declare const samlAuthFixture: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    BaseWorkerFixtures & {
      samlAuth: SamlAuth;
    }
>;
/**
 * Re-exported alias so worker-level fixtures that need samlAuth can import
 * `coreWorkerFixtures` from `./saml_auth` (the extended version) rather than
 * from `./core_fixtures` (the base version without samlAuth).
 */
export { samlAuthFixture as coreWorkerFixtures };
