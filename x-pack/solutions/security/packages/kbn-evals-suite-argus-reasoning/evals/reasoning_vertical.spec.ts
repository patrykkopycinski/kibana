/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate } from '@kbn/evals';
import { tags } from '@kbn/scout';
import type { Client } from '@elastic/elasticsearch';
import { evaluateReasoning } from '../src/evaluate_reasoning';

evaluate.describe(
  'Argus Reasoning Eval Vertical',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate(
      'scores recent argus reasoning spans and persists a run',
      async ({ esClient, log }) => {
        const result = await evaluateReasoning(
          { esClient: esClient as unknown as Client, log },
          { since: 'now-24h' }
        );

        log.info(
          `Argus reasoning eval persisted run=${result.run_id} gate=${result.gate_decision} spans=${result.spans_evaluated}`
        );

        if (!['pass', 'marginal', 'fail'].includes(result.gate_decision)) {
          throw new Error(`argus-reasoning: unexpected gate_decision=${result.gate_decision}`);
        }
      }
    );
  }
);
