/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightEvalsConfig } from '@kbn/evals';

const config = createPlaywrightEvalsConfig({
  testDir: './evals',
  // L3 waits up to 17 minutes for the child workflow; the 5 minute default aborts it first.
  timeout: 30 * 60_000,
});

// Measurement-only (kanban t_46cb6525, not for merge): `EVAL_REPETITIONS` re-scores ONE
// observed workflow output (report_action_safety.ts), so it cannot yield independent
// analyses. `repeatEach` re-runs the whole seed -> sweep -> analysis path per repetition.
// Assigned in place so the config object (and Playwright's config marker) stays intact.
config.repeatEach = Number(process.env.EVAL_REPEAT_EACH || 3);

export default config;
