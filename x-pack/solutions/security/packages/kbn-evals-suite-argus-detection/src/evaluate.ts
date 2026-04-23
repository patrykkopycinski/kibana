/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate as base } from '@kbn/evals';
import type { Client } from '@elastic/elasticsearch';
import type { ReplayClient } from './replay_rule';
import { createEsReplayClient } from './replay_rule';

/**
 * Argus Detection Eval Vertical — Playwright fixture.
 *
 * Extends the base `@kbn/evals` fixture with a worker-scoped `replayClient`.
 * The replay client is constructed once per worker from Scout's `esClient`
 * worker fixture, giving the suite a direct, deterministic path to
 * `.soc-eval-corpus-*` without needing Phoenix or an LLM connector.
 */
export const evaluate = base.extend<
  {},
  {
    replayClient: ReplayClient;
  }
>({
  replayClient: [
    async ({ esClient }, use) => {
      await use(createEsReplayClient(esClient as unknown as Client));
    },
    { scope: 'worker' },
  ],
});
