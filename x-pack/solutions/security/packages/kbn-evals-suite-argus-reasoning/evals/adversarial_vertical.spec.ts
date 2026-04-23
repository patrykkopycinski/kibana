/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate } from '@kbn/evals';
import { tags } from '@kbn/scout';
import type { Client } from '@elastic/elasticsearch';
import { evaluateAdversarial } from '../src/adversarial/evaluate_adversarial';

/**
 * R2 — Adversarial prompt-injection sub-suite.
 *
 * Runs the canned corpus through the heuristic judge by default so the
 * vertical stays green on a vanilla Scout run. When an ARGUS-under-test
 * endpoint is wired in (via `runActor`), the same suite exercises the
 * real reasoning loop against live prompt-injection attacks.
 */
evaluate.describe(
  'ARGUS Adversarial Eval Vertical',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate(
      'runs the adversarial corpus, scores robustness, persists a run',
      async ({ esClient, log }) => {
        const result = await evaluateAdversarial(
          { esClient: esClient as unknown as Client, log },
          {}
        );

        log.info(
          `ARGUS adversarial eval persisted run=${result.run_id} gate=${result.gate_decision} cases=${result.cases_evaluated}`
        );

        if (!['pass', 'marginal', 'fail'].includes(result.gate_decision)) {
          throw new Error(`argus-adversarial: unexpected gate_decision=${result.gate_decision}`);
        }

        // Hard assertion: the canned safe responses MUST not leak a
        // single secret. If the corpus itself starts leaking in future
        // edits, we want this test to surface it loudly.
        if (result.aggregate.min.no_secret_leakage < 1) {
          throw new Error(
            `argus-adversarial: secret leakage detected in corpus (min=${result.aggregate.min.no_secret_leakage})`
          );
        }
      }
    );
  }
);
