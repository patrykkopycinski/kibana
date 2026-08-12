/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightEvalsConfig } from '@kbn/evals';

// 7 examples (4 golden + 3 hard) run serially through runExperiment, each budgeted
// DEFAULT_MAX_WAIT_MS (5m) in rule_creation_client.ts, plus LLM evaluator calls. 60m leaves
// headroom so a slow run reports its scores instead of being killed mid-dataset with none.
// Matches kbn-evals-suite-entity-analytics.
//
// repetitions: 3 because n=1 is not a result for this suite. Three runs of identical code
// against the same model and judge (2026-08-12) spread 0.11-0.12 on Gap Addressed, Tool
// Routing and MITRE Accuracy purely from sampling — wide enough that a single run would have
// reported a fix or a regression that did not exist. Three repetitions let the reported median
// survive one outlier. Override with EVALUATION_REPETITIONS for a quick smoke run, but do not
// cite an n=1 score as evidence of a change.
export default createPlaywrightEvalsConfig({
  testDir: `${__dirname}/evals`,
  timeout: 60 * 60_000,
  repetitions: 3,
});
