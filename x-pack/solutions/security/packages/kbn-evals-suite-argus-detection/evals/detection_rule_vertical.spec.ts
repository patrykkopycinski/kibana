/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate } from '../src/evaluate';
import { createEvaluateDetectionRules } from '../src/evaluate_dataset';
import { MYTHOS_CORPUS_2026_04 } from '../datasets/mythos_corpus_2026_04';

evaluate.describe(
  'Argus Detection Eval Vertical',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate(
      'scores detection rules against the Mythos-era corpus',
      async ({ executorClient, evaluators, replayClient, log }) => {
        const run = createEvaluateDetectionRules({
          executorClient,
          evaluators,
          replayClient,
          log,
        });

        log.info(
          `Running Argus detection eval vertical with ${MYTHOS_CORPUS_2026_04.examples.length} example(s)`
        );
        await run({ dataset: MYTHOS_CORPUS_2026_04 });
        log.info('Argus detection eval vertical complete');
      }
    );
  }
);
