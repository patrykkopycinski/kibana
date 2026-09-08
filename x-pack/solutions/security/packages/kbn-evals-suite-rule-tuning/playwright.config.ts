/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightEvalsConfig } from '@kbn/evals';

export default createPlaywrightEvalsConfig({
  testDir: `${__dirname}/evals`,
  timeout: 30 * 60_000,
  // Judged decisions are stochastic: a single pass reports sampling noise as if
  // it were signal. Three passes let the reporter separate run-to-run variance
  // from a real difference between models. EVAL_REPETITIONS still overrides
  // this, so local iteration can drop back to 1.
  repetitions: 3,
});
