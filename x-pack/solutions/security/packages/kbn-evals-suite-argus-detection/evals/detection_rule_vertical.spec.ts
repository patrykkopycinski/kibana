/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import type { Client } from '@elastic/elasticsearch';
import { evaluate } from '../src/evaluate';
import { createEvaluateDetectionRules } from '../src/evaluate_dataset';
import { MYTHOS_CORPUS_2026_04 } from '../datasets/mythos_corpus_2026_04';
import { ATTACK_ER7_CORPUS } from '../datasets/attack_er7_corpus';

const CORPORA = [MYTHOS_CORPUS_2026_04, ATTACK_ER7_CORPUS] as const;

evaluate.describe(
  'ARGUS Detection Eval Vertical',
  { tag: tags.serverless.security.complete },
  () => {
    for (const corpus of CORPORA) {
      evaluate(
        `scores detection rules against the ${corpus.id} corpus and persists runs`,
        async ({ esClient, replayClient, log }) => {
          const run = createEvaluateDetectionRules({
            esClient: esClient as unknown as Client,
            replayClient,
            log,
          });

          const result = await run({
            corpusId: corpus.id,
            corpusIndex: corpus.index,
          });

          log.info(
            `ARGUS detection eval [${corpus.id}] persisted run_id=${result.run_id} with ${result.rows.length} rule row(s)`
          );

          if (result.rows.length === 0) {
            throw new Error(
              `ARGUS detection eval vertical [${corpus.id}]: expected at least one rule evaluation row, got 0. ` +
                'Did setup.sh seed the variant bank into .soc-eval-corpus-*?'
            );
          }
          for (const row of result.rows) {
            if (!['pass', 'fail', 'marginal'].includes(row.gate_decision)) {
              throw new Error(
                `rule ${row.rule_id} produced unexpected gate_decision=${row.gate_decision}`
              );
            }
            if (
              row.counts.true_positives + row.counts.false_negatives !==
              row.variants.positive_total
            ) {
              throw new Error(`rule ${row.rule_id}: TP+FN should equal positive_total`);
            }
          }
        }
      );
    }
  }
);
