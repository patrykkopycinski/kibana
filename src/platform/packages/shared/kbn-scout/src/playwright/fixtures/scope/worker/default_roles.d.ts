import type { ElasticsearchRoleDescriptor } from '../../../../common';
export interface DefaultRolesFixture {
    availableRoles: Map<string, ElasticsearchRoleDescriptor>;
    rolesFilePath: string;
}
/**
 * Provides role descriptors for default roles.
 * Uses worker scope to ensure the file is read only once per worker.
 */
export declare const defaultRolesFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("./core_fixtures").BaseWorkerFixtures & {
    defaultRoles: DefaultRolesFixture;
}>;
