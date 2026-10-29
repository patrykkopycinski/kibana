/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate as base } from '../../src/evaluate';
import type { EvaluateDataset } from '../../src/evaluate_dataset';
import { createEvaluateDataset } from '../../src/evaluate_dataset';
import {
  COVERAGE_GAP_CASES,
  seedHardCoverageFixtures,
} from './detection_coverage_hard_fixtures';

/**
 * Discriminating Rule Coverage dataset (#19982, P3a). 64 gaps across the four verdicts,
 * with hard-negative traps tagged on the case. Scored by `evaluateDataset`, so every
 * example exports a score. Verdict accuracy only; P3b graders come later.
 *
 * The routing (`expectedSkill`) matches the existing `detection-coverage` routing suite.
 */

const evaluate = base.extend<{ evaluateDataset: EvaluateDataset }, {}>({
  evaluateDataset: [
    ({ chatClient, evaluators, executorClient, traceEsClient, log }, use) => {
      use(
        createEvaluateDataset({
          chatClient,
          evaluators,
          executorClient,
          traceEsClient,
          log,
        })
      );
    },
    { scope: 'test' },
  ],
});

evaluate.describe(
  'Security Skills - Detection Coverage hard dataset',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    let teardown: (() => Promise<void>) | undefined;

    evaluate.beforeAll(async ({ kbnClient, log }) => {
      const seeded = await seedHardCoverageFixtures({ kbnClient, log });
      teardown = seeded.cleanup;
    });

    evaluate.afterAll(async () => {
      await teardown?.();
    });

    evaluate('returns the expected verdict for each gap', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'agent builder: security-detection-coverage-hard',
          description:
            'Verdict accuracy across 64 gaps (covered_enabled / covered_disabled / ' +
            'prebuilt_available / no_coverage) with hard negatives tagged per case.',
          examples: COVERAGE_GAP_CASES.map((c) => ({
            input: {
              question: `Detection gap (ATT&CK ${c.attackTechnique}): ${c.gap} Decide whether this is already covered and report one verdict.`,
            },
            output: {
              expected: c.expectedVerdict,
            },
            metadata: {
              query_intent: 'Hard Coverage Gap',
              expectedSkill: 'detection-coverage',
              caseId: c.id,
              attackTechnique: c.attackTechnique,
              traps: c.traps.join(',') || 'none',
            },
          })),
        },
      });
    });
  }
);
