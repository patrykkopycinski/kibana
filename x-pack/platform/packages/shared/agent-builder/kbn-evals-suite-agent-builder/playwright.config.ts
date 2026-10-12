/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Path from 'path';
import { createPlaywrightEvalsConfig } from '@kbn/evals';

export default createPlaywrightEvalsConfig({
  testDir: Path.resolve(__dirname, './evals'),
  // The `esql-generation` suite (`esql.playwright.config.ts`) owns specs
  // under `evals/esql/`. Excluding them here prevents the recursive
  // `testDir` walk from picking them up and double-running them in the
  // agent-builder weekly cycle.
  // The endpoint-forensic-analysis routing-collision A/B (`collision.playwright.config.ts`) needs a
  // stack with `endpointForensicAnalysisSkill` enabled; under this config the skill is dark and
  // absent from the catalog, so its `az-owns` examples would fail for a reason unrelated to routing.
  testIgnore: ['**/esql/**', '**/skill_selection/**', '**/endpoint_forensic_analysis_collision/**'],
  // CI job timeout is ~1h; keep default low and use EVAL_REPETITIONS
  // for longer/higher-confidence runs.
  repetitions: 1,
  timeout: 4 * 60 * 60_000, // 4 hours timeout given large datasets in use
  workers: 2,
});
