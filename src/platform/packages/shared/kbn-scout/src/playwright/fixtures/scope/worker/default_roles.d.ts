/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchRoleDescriptor } from '../../../../common';
export interface DefaultRolesFixture {
  availableRoles: Map<string, ElasticsearchRoleDescriptor>;
  rolesFilePath: string;
}
/**
 * Provides role descriptors for default roles.
 * Uses worker scope to ensure the file is read only once per worker.
 */
export declare const defaultRolesFixture: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('./core_fixtures').BaseWorkerFixtures & {
      defaultRoles: DefaultRolesFixture;
    }
>;
