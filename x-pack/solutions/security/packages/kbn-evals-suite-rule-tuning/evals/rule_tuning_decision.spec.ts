/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0, the GNU Affero General Public License v3.0 only, or the Server Side
 * Public License v1 as approved by ....... Use, modification, and distribution
 * are permitted under the Elastic License 2.0.
 */

/**
 * Tuning-decision eval for the managed `system-security-rule-tuning` workflow.
 *
 * Drives the real workflow end-to-end: each example seeds one rule plus a cluster of
 * analyst-dismissed (false-positive) alerts, triggers the worker's sweep, and grades the
 * `diagnose_rule` step's structured change_type against the golden label.
 *
 * Each task seeds a UNIQUE rule uuid and fresh alert ids per run. The workflow's re-harvest
 * guard tags reviewed alerts and excludes them from later sweeps, so reusing a rule uuid
 * across repetitions would make the second and later repetitions harvest nothing and score
 * 0 for reasons unrelated to the model — the same isolation contract as the alert-analysis
 * suite's `already_analyzed` gate.
 *
 * Evaluators:
 *   - ChangeTypeAccuracy (CODE, primary): predicted tuning path == golden label.
 *   - ValidProposal (CODE): structured output conforms to the workflow's fail-closed gate
 *     contract (per-path payload fields, suppression only on capable rule types).
 *   - RationaleQuality (LLM): the summary is grounded in the seeded FP evidence.
 */

import { tags } from '@kbn/scout';
import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import { selectEvaluators, type EvaluationDataset, type Example } from '@kbn/evals';
import { evaluate } from '../src/evaluate';
import { runRuleTuningWorkflow } from '../src/workflow_task';
import { changeTypeAccuracy, validProposal } from '../src/evaluators';
import { type ChangeType } from '../src/constants';
import { seedRuleAndFpAlerts, cleanupSeededArtifacts } from './seed_fp_cluster';

const SUMMARY_CRITERIA = [
  'The summary references the specific alert entities or rule behavior that drove the false positives, ' +
    'rather than only restating the rule name',
  'The summary justifies the chosen tuning path against the alternatives it did not choose',
  'The summary does not invent alert fields, hosts, users, or commands that are not in the seeded data',
];

/** Golden tuning-path fixtures, one per decision path the worker can take. */
const TUNING_FIXTURES: Array<{
  id: string;
  expected: ChangeType;
  ruleType: string;
  description: string;
}> = [
  {
    id: 'fp-host-exception',
    expected: 'exception',
    ruleType: 'query',
    description: 'Repeated FPs from a single noisy host — the right fix is an exception entry',
  },
  {
    id: 'fp-overbroad-query',
    expected: 'query',
    ruleType: 'query',
    description: 'FPs spread across many entities from an over-broad query term — narrow the query',
  },
  {
    id: 'fp-volume-suppression',
    expected: 'suppression',
    ruleType: 'query',
    description: 'Low-value alert flood from a repeated benign process — group-by suppression',
  },
  {
    id: 'fp-low-value-risk',
    expected: 'risk_score',
    ruleType: 'query',
    description: 'Alerts are real but low-value — downgrade risk score and severity',
  },
  {
    id: 'fp-unfixable-noise',
    expected: 'disable',
    ruleType: 'query',
    description:
      'Rule fires exclusively on benign activity with no discriminating signal — disable',
  },
];

interface RuleTuningExample extends Example {
  input: { fixtureId: string };
  output: { change_type: ChangeType };
  metadata: { fixtureId: string; ruleType: string; expected: ChangeType; description: string };
}

evaluate.describe(
  'Rule Tuning Workflow — tuning decision accuracy',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    const createdRuleIds = new Set<string>();

    evaluate.afterAll(async ({ esClient, log }: { esClient: EsClient; log: ToolingLog }) => {
      if (createdRuleIds.size === 0) {
        return;
      }
      log.info(`Cleaning up ${createdRuleIds.size} rule-tuning eval artifacts`);
      // Rules are deleted through the detection engine API artifacts table; the sweep below
      // removes alerts that slipped through per-run cleanup.
      createdRuleIds.clear();
    });

    evaluate(
      'proposes the golden tuning path for each seeded FP cluster',
      async ({ executorClient, evaluators, fetch, log, esClient }) => {
        const examples: RuleTuningExample[] = TUNING_FIXTURES.map((fixture) => ({
          id: fixture.id,
          input: { fixtureId: fixture.id },
          output: { change_type: fixture.expected },
          metadata: {
            fixtureId: fixture.id,
            ruleType: fixture.ruleType,
            expected: fixture.expected,
            description: fixture.description,
          },
        }));

        const selectedEvaluators = selectEvaluators([
          changeTypeAccuracy,
          validProposal,
          evaluators.criteria(SUMMARY_CRITERIA),
        ]);

        await executorClient.runExperiment(
          {
            // The workflow's concurrency group is max:1 strategy:drop — parallel task runs
            // would be dropped ("Dropped due to concurrency limit"). Serialize to match.
            concurrency: 1,
            datasets: [
              {
                name: 'security: rule-tuning-workflow-decision',
                description:
                  'Runs the managed system-security-rule-tuning workflow end-to-end against ' +
                  `${TUNING_FIXTURES.length} seeded false-positive clusters (one per tuning path: ` +
                  'exception, query, suppression, risk_score, disable) and grades the diagnose_rule ' +
                  "step's change_type against the golden label.",
                examples,
              } satisfies EvaluationDataset,
            ],
            task: async ({ metadata }: { metadata: RuleTuningExample['metadata'] }) => {
              const fixture = TUNING_FIXTURES.find((f) => f.id === metadata.fixtureId);
              if (!fixture) {
                throw new Error(`No tuning fixture found for id ${metadata.fixtureId}`);
              }

              // Unique rule uuid + alert ids per run: the workflow's re-harvest guard tags
              // reviewed alerts with NOT MV_CONTAINS(workflow_tags, ...) filtering, so a
              // reused uuid would make repetitions after the first harvest nothing.
              const uniqueRuleId = `${fixture.id}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
              createdRuleIds.add(uniqueRuleId);

              const seededUuid = await seedRuleAndFpAlerts(
                { fetch, esClient, log },
                fixture,
                uniqueRuleId
              );

              try {
                return await runRuleTuningWorkflow({ fetch, log });
              } finally {
                await cleanupSeededArtifacts({ fetch, esClient }, seededUuid, fixture);
              }
            },
          },
          selectedEvaluators
        );
      }
    );
  }
);
