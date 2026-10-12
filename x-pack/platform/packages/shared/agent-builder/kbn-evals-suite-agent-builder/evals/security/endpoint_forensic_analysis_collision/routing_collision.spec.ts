/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate } from './evaluate_setup';
import { COLLISION_EXAMPLES, filterCollisionExamples } from './collision_dataset';

/**
 * Behavioural routing-collision eval for the dark-shipped `endpoint-forensic-analysis` skill.
 *
 * The sibling catalog already carries three skills whose descriptions disambiguate against each
 * other in prose only, and Agent Builder routing is additive-only — no skill can remove a
 * competitor. So "does enabling this skill steal traffic from threat-hunting / alert-analysis /
 * elastic-defend-configuration-troubleshooting" is only answerable behaviourally.
 *
 * This spec is intentionally NOT part of the default `agent-builder` config: with the
 * `endpointForensicAnalysisSkill` flag off, the skill is absent from the catalog, so every
 * `az-owns` example would fail for a reason that has nothing to do with routing. It runs under
 * `collision.playwright.config.ts` as a two-arm A/B:
 *
 *   - `agent-builder-collision-baseline`  -> `evals_agent_builder` (skill dark, absent from catalog)
 *   - `agent-builder-collision-endpoint-forensic` -> `evals_agent_builder_endpoint_forensic` (skill live)
 *
 * The claim is the DIFFERENCE between the arms on the `sibling-owns` examples: a sibling example
 * that holds in the baseline and collapses in the candidate is a collision caused by enabling the
 * skill. A sibling score of 1.00 in BOTH arms means the dataset did not reproduce a collision and
 * must be hardened before any conclusion is drawn — an accurate null, not a green light.
 *
 * One test per pair, so the run's per-dataset table is the pairwise matrix and a misroute can be
 * read off the pair that owns it. Scope a rerun with `EVAL_EXAMPLES=<exampleId>,...` (ids are the
 * `metadata.exampleId` values in `collision_dataset.ts`) so both arms measure the same subset.
 */
const selectedExamples = filterCollisionExamples(COLLISION_EXAMPLES);
const pairs = [...new Set(selectedExamples.map(({ metadata }) => metadata.pair))];

evaluate.describe(
  'Endpoint Forensic Analysis - routing collision boundary',
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
          type: 'collision-subset',
          description: `${pairExamples.length}/${COLLISION_EXAMPLES.length} examples of the full collision set`,
        });

        await evaluateDataset({
          dataset: {
            name: `agent builder: security-endpoint-forensic-collision-${pair}`,
            description:
              'Pairwise routing boundary between endpoint-forensic-analysis and one sibling skill. ' +
              'Each example declares metadata.expectedSkill (or metadata.shouldNotActivateSkill) plus ' +
              'direction and siblingSkill, so a misroute is attributed via the loadedNames metadata.',
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
