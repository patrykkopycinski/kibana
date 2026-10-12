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
 * Scope a rerun with `EVAL_EXAMPLES=<exampleId>,<exampleId>` (ids are the `metadata.exampleId`
 * values in `collision_dataset.ts`) so both arms measure the same subset.
 */
evaluate.describe(
  'Endpoint Forensic Analysis - routing collision boundary',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate(
      'pairwise routing boundaries between endpoint-forensic-analysis and its siblings',
      async ({ evaluateDataset }, testInfo) => {
        const examples = filterCollisionExamples(COLLISION_EXAMPLES);
        const pairs = [...new Set(examples.map(({ metadata }) => metadata.pair))];

        testInfo.annotations.push({
          type: 'collision-scope',
          description: `${examples.length}/${COLLISION_EXAMPLES.length} examples scored across pairs: ${pairs.join(
            ', '
          )}`,
        });

        await evaluateDataset({
          dataset: {
            name: 'agent builder: security-endpoint-forensic-analysis-routing-collision',
            description:
              'Pairwise routing boundaries between endpoint-forensic-analysis and threat-hunting, ' +
              'alert-analysis and elastic-defend-configuration-troubleshooting. Each example declares ' +
              'metadata.expectedSkill (or metadata.shouldNotActivateSkill) plus the pair and direction, ' +
              'so a misroute can be attributed to a specific sibling via the loadedNames metadata.',
            examples: examples.map(({ question, expected, metadata }) => ({
              input: { question },
              output: { expected },
              metadata,
            })),
          },
        });
      }
    );
  }
);
