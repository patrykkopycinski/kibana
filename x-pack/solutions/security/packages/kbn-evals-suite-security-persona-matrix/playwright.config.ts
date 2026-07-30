/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightEvalsConfig } from '@kbn/evals';

export default createPlaywrightEvalsConfig({
  testDir: `${__dirname}/evals`,
  // The co-located Attack Discovery spec runs under its own config
  // (playwright.attack_discovery.config.ts) with the evals_tracing server config.
  testIgnore: '**/attack_discovery.spec.ts',
  // Bumped 30min -> 60min: local vLLM L4 deploys under concurrent-5 load can
  // take 45+ min to clear all 21 examples (KV cache saturation slows
  // throughput without erroring, distinct from a stuck/dead run). Frontier
  // cloud models finish in single-digit minutes, so this only relaxes the
  // ceiling for the slow tail, it doesn't mask genuine hangs.
  timeout: 60 * 60_000,
});
