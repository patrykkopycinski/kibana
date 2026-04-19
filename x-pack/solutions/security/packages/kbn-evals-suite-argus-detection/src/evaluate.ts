/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate as base } from '@kbn/evals';
import type { ReplayClient } from './replay_rule';
import { createNoopReplayClient } from './replay_rule';

/**
 * Argus Detection Eval Vertical — test fixture.
 *
 * Extends the base `@kbn/evals` Playwright fixture with a `replayClient` worker
 * fixture. The replay client is the seam where the suite invokes the Security
 * Solution detection-rule runner to produce a `DetectionRuleTaskOutput` for each
 * corpus event.
 *
 * Day-1 (2026-04-17): `replayClient` is a no-op stub — the suite wiring is the
 * deliverable, not the replay logic. Day-2 replaces this with the real rule
 * runner seam (see issue #16904 phase 2 + docs/argus/scaffolds/m2-1-detection-rule-evaluator.md).
 */
export const evaluate = base.extend<
  {},
  {
    replayClient: ReplayClient;
  }
>({
  replayClient: [
    async (_, use) => {
      await use(createNoopReplayClient());
    },
    { scope: 'worker' },
  ],
});
