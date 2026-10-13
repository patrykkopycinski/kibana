/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { globalSetupHook } from '@kbn/scout-security';

/**
 * No archives are needed for the escalation queue suites: all data is seeded
 * directly through the internal Agent Builder routes. The hook exists so the
 * config's `runGlobalSetup: true` has a no-op setup that still boots the
 * server, spaces and auth fixtures.
 */
globalSetupHook('alertzero escalation queue suites need no archive data', async ({ log }) => {
  log.debug('[setup] escalation queue suites: no archive ingestion required');
});
