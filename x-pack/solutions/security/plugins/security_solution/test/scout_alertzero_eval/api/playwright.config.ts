/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightConfig } from '@kbn/scout-security';

/**
 * Sequential: the eval measures token usage per sweep, so two sweeps running at once would put rows
 * from one into the other's measurement window. Needs the `alertzero_eval` server config set (EIS
 * models, one pinned model per run).
 */
export default createPlaywrightConfig({
  testDir: './tests',
  workers: 1,
});
