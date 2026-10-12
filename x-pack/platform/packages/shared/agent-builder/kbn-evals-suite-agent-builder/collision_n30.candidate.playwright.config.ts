/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Path from 'path';
import { createPlaywrightEvalsConfig } from '@kbn/evals';

/**
 * n>=30 routing-collision A/B configs (t_d9046fa9). Two separate files so each registers
 * as its own suite with its own serverConfigSet:
 *   alertzero-efa-collision-baseline  -> evals_agent_builder (skill dark)
 *   alertzero-efa-collision-candidate -> evals_agent_builder_endpoint_forensic (skill live)
 * Per-pair runs are scoped with EVAL_EXAMPLES (48-52 ids per job) to stay inside the
 * 45-min smoke test cap; `repetitions: 1` here is overridden by the runner's --reps.
 */
export default createPlaywrightEvalsConfig({
  testDir: Path.resolve(__dirname, './evals/security/endpoint_forensic_analysis_collision'),
  repetitions: 1,
  timeout: 40 * 60_000,
  workers: 1,
});
