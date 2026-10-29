/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, SamlAuth } from '@kbn/scout-security';
import { apiTest } from '@kbn/scout-security';
import { createApi } from '../../../scout_alertzero_e2e/common/kbn';
import type { AlertZeroApi } from '../../../scout_alertzero_e2e/common/kbn';

// The worker control plane, execution polling and the AD2 seeder are the e2e suite's fixtures and
// are reused as-is; this suite only adds what the eval needs on top (scale-tier seeding, the
// inference-settings write, the token-usage dump).
export * from '../../../scout_alertzero_e2e/api/fixtures';
export * from '../../common/constants';
export * from './eval';
export * from './worker_identity';

/** Authenticates once per worker as the admin user and exposes the cookie-bearing API helper. */
export const getAdminApi = async (
  apiClient: ApiClientFixture,
  samlAuth: SamlAuth
): Promise<AlertZeroApi> => {
  const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
  return createApi(apiClient, cookieHeader);
};

export { apiTest };
