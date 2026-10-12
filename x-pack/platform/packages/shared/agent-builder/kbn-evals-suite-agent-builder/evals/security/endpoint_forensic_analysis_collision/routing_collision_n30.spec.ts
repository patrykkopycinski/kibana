/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate } from './evaluate_setup';
import { COLLISION_EXAMPLES, filterCollisionExamples } from './collision_dataset_n30';

/**
 * n>=30-per-pair powered variant of the routing-collision A/B (t_d9046fa9).
 *
 * Runs the 100-example collision_dataset_n30 (16 sibling-owns + 16 az-owns per pair,
 * 4 az-must-not-load negatives) in one test per pair so the run's per-dataset table IS
 * the pairwise matrix. Scoped per pair with `EVAL_EXAMPLES=<ids>` so each job measures
 * exactly one pair and stays inside the 45-min smoke test cap; `EVAL_EXAMPLES` must not
 * be used to mix pairs across arms — always reuse the same id list for both arms of a pair.
 *
 * The arm label is derived from `EVAL_SUITE_ID`, which the kbn-evals CLI exports to the specs
 * (`alertzero-efa-collision-baseline` -> `baseline`, `alertzero-efa-collision-candidate` ->
 * `candidate`; `COLLISION_ARM` overrides for local runs), and is embedded in the dataset NAME,
 * so each arm lands in the golden
 * index under a distinct experiment name (`alertzero-efa-collision-<arm>-<pair>`) and
 * arms never collapse into one golden entry.
 *
 * Reading the result:
 *  - baseline arm: `az-owns` examples cannot pass (the skill is absent from the catalog);
 *    sibling-owns passing here is the CONTROL. The collision claim is the DIFFERENCE
 *    between arms on sibling-owns examples, judged per example across reps.
 *  - candidate arm: sibling-owns scoring 0 = misroute (AZ steals sibling traffic);
 *    az-owns scoring 0 = reverse collision (sibling wins AZ traffic).
 *  - `az-must-not-load` negatives score 1 only if AZ was NOT loaded.
 */

const ARM =
  process.env.COLLISION_ARM === 'candidate' || process.env.COLLISION_ARM === 'baseline'
    ? process.env.COLLISION_ARM
    : (process.env.EVAL_SUITE_ID ?? '').endsWith('efa-collision-candidate')
      ? 'candidate'
      : 'baseline';

const selectedExamples = filterCollisionExamples(COLLISION_EXAMPLES);

const pairs = [...new Set(selectedExamples.map(({ metadata }) => metadata.pair))];

evaluate.describe(
  `Endpoint Forensic Analysis - routing collision boundary (n30, ${ARM} arm)`,
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    for (const pair of pairs) {
      const pairExamples = selectedExamples.filter(({ metadata }) => metadata.pair === pair);

      evaluate(`${pair}: expected skill wins the boundary`, async ({ evaluateDataset }, testInfo) => {
        const directions = [...new Set(pairExamples.map(({ metadata }) => metadata.direction))];
        testInfo.annotations.push({
          type: 'collision-scope',
          description: `${pairExamples.length} examples, directions: ${directions.join(', ')}`,
        });
        testInfo.annotations.push({
          type: 'collision-arm',
          description: ARM,
        });

        await evaluateDataset({
          dataset: {
            name: `alertzero-efa-collision-${ARM}-${pair}`,
            description:
              `Pairwise routing boundary between endpoint-forensic-analysis and one sibling skill ` +
              `(${ARM} arm, n=${pairExamples.length}). Each example declares metadata.expectedSkill ` +
              '(or metadata.shouldNotActivateSkill) plus direction and siblingSkill, so a misroute is ' +
              'attributed via the loadedNames metadata.',
            examples: pairExamples.map(({ question, expected, metadata }) => ({
              input: { question },
              output: { expected },
              metadata,
            })),
          },
        });
      });
    }
  }
);
