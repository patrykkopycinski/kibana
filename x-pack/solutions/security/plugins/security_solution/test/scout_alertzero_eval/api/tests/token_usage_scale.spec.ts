/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-security/api';
import {
  ALERTZERO_TIER_FEATURE_IDS,
  COVERAGE_PLUGIN_ID,
  EXPECTED_PLUGIN_IDS,
  makeRunMarker,
  MAX_GAPS_PER_SWEEP,
  MAX_RULES_PER_SWEEP,
  parseBacktestScenarios,
  parseScaleTiers,
  RULE_COVERAGE_SWEEP_WORKFLOW_ID,
  RULE_CREATION_PLUGIN_ID,
  RULE_TUNING_PLUGIN_ID,
  BACKTEST_SCENARIOS_ENV,
  RULE_TUNING_SWEEP_WORKFLOW_ID,
  REVIEW_TIMEOUT_MS,
  SCALE_TIERS,
  SWEEP_TIMEOUT_MS,
  apiTest,
  assertRowsAreAttributable,
  attachArtifact,
  buildArtifact,
  collectTokenUsageSettled,
  describeSweepDiagnosis,
  getAdminApi,
  getAssignedEndpoints,
  isEisEndpointId,
  runSweep,
  seedBacktestScenarios,
  seedCoverageGaps,
  seedTuningNoise,
  setModelTier,
  type SweepHandle,
  tags,
} from '../fixtures';

/**
 * Endpoints every AlertZero tier is assigned for the run. The eval measures one model at a time, so
 * one value pins both the stack's default connector (the `alertzero_eval` config set reads the same
 * env) and the three AlertZero tiers. `ALERTZERO_EVAL_TIER_ENDPOINTS` overrides it with a
 * comma-separated list for a run that wants, say, a cheap fast tier and a frontier agentic one.
 */
const tierEndpoints = (
  process.env.ALERTZERO_EVAL_TIER_ENDPOINTS ??
  process.env.ALERTZERO_EVAL_AI_CONNECTOR ??
  ''
)
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

/**
 * Seeds alerts at each scale tier, drives each Worker sweep by hand, waits for the reviews it fans
 * out to, and dumps the token rows the sweeps produced.
 *
 * Structural assertions only: the counts a sweep reports stay inside the Worker caps, every row is
 * attributed to a Worker plugin-id and was served by an EIS endpoint. No expectation is phrased on
 * a number a model chose, so the same spec is valid for every model the eval is run against.
 *
 * A timeout fails the run, never skips it: a sweep that never settles is the finding.
 */
apiTest.describe(
  'AlertZero eval - token usage per worker sweep',
  { tag: [...tags.stateful.classic] },
  () => {
    apiTest(
      'pins every AlertZero inference tier to an EIS endpoint',
      async ({ apiClient, samlAuth }) => {
        if (tierEndpoints.length === 0) {
          throw new Error(
            'Set ALERTZERO_EVAL_AI_CONNECTOR (or ALERTZERO_EVAL_TIER_ENDPOINTS) to the EIS endpoint the eval should measure'
          );
        }
        expect(tierEndpoints.every(isEisEndpointId)).toBe(true);

        const api = await getAdminApi(apiClient, samlAuth);
        for (const featureId of ALERTZERO_TIER_FEATURE_IDS) {
          const response = await setModelTier(api, { featureId, endpointIds: tierEndpoints });
          expect(response.invalidEndpoints ?? []).toStrictEqual([]);
          expect(await getAssignedEndpoints(api, featureId)).toStrictEqual(tierEndpoints);
        }
      }
    );

    apiTest(
      'measures the rule tuning sweep at each scale tier',
      async ({ apiClient, samlAuth, esClient }, testInfo) => {
        // Playwright's default test cap is 60s; the sweep budget is minutes. Raise it here or the
        // run dies on 'Test timeout of 60000ms exceeded' long before the sweep can settle
        // (measured: smoke-10d4d7b2bfbe41ff).
        testInfo.setTimeout(SWEEP_TIMEOUT_MS + REVIEW_TIMEOUT_MS + 60_000);
        const api = await getAdminApi(apiClient, samlAuth);
        for (const tier of parseScaleTiers(process.env.ALERTZERO_EVAL_SCALES)) {
          const seed = await seedTuningNoise(esClient, api, {
            tier,
            runMarker: makeRunMarker(`tuning-${tier}`),
          });
          let sweep: SweepHandle | undefined;
          try {
            expect(SCALE_TIERS[tier].rules).toBeLessThanOrEqual(MAX_RULES_PER_SWEEP);

            sweep = await runSweep(api, {
              workflowId: RULE_TUNING_SWEEP_WORKFLOW_ID,
              tier,
              timeoutMs: SWEEP_TIMEOUT_MS,
            });

            const requested = Number(sweep.outputs.reviews_requested ?? 0);

            const rows = await collectTokenUsageSettled(esClient, { since: sweep.startedAt });

            // Evidence ships before the verdict: a red assertion must not take its own data down.
            await attachArtifact(
              testInfo,
              `alertzero-eval-token-usage-tuning-${tier}.json`,
              buildArtifact(tier, [sweep], rows)
            );

            // The sweep's own count is asserted AFTER the evidence is attached: a broken harvest
            // and a missing token index must not read as the same failure (measured:
            // smoke-e01d0215577b44e8, where index_not_found masked the sweep's numbers).
            const diagnosis = requested === 0 ? await describeSweepDiagnosis(api, sweep.executionId) : '';
            expect(requested, `reviews_requested=${requested}\n${diagnosis}`).toBe(
              SCALE_TIERS[tier].rules
            );
            expect(requested).toBeLessThanOrEqual(MAX_RULES_PER_SWEEP);

            assertRowsAreAttributable(rows, { expectedPluginIds: [RULE_TUNING_PLUGIN_ID] });
            expect(rows.length).toBeGreaterThan(0);
          } finally {
            // Released only after the token rows are read: the reviews resume as the bound account.
            await sweep?.release();
            await seed.cleanup();
          }
        }
      }
    );

    apiTest(
      'measures the coverage sweep at each scale tier',
      async ({ apiClient, samlAuth, esClient }, testInfo) => {
        testInfo.setTimeout(SWEEP_TIMEOUT_MS + REVIEW_TIMEOUT_MS + 60_000);
        const api = await getAdminApi(apiClient, samlAuth);
        for (const tier of parseScaleTiers(process.env.ALERTZERO_EVAL_SCALES)) {
          const seed = await seedCoverageGaps(esClient, {
            tier,
            runMarker: makeRunMarker(`coverage-${tier}`),
          });
          let sweep: SweepHandle | undefined;
          try {
            sweep = await runSweep(api, {
              workflowId: RULE_COVERAGE_SWEEP_WORKFLOW_ID,
              tier,
              timeoutMs: SWEEP_TIMEOUT_MS,
            });

            const started = Number(sweep.outputs.started ?? sweep.outputs.reviews_requested ?? 0);

            // `started` is the count the worker's own `start_reviews` foreach dispatched, which is
            // the number of reviews the sweep fanned out to — the child-executions route reports the
            // worker's own children, not one entry per review (measured: smoke-c6f1764679d04a23
            // dispatched 50 and returned 1 child), so it is not the assertion to make here. Asserted
            // before the token read so a missing token index cannot mask the sweep's own numbers.
            const diagnosis = started === 0 ? await describeSweepDiagnosis(api, sweep.executionId) : '';
            // Explicit zero check first: a sweep that fanned out nothing measured nothing, and must
            // never read as a pass (measured: smoke-1d5fadef7fa14e26, no coverage reviews ran).
            expect(started, `reviews requested=${started}, expected > 0\n${diagnosis}`).toBeGreaterThan(0);
            expect(started, `started=${started}\n${diagnosis}`).toBe(SCALE_TIERS[tier].gaps);
            expect(started).toBeLessThanOrEqual(MAX_GAPS_PER_SWEEP);

            const rows = await collectTokenUsageSettled(esClient, { since: sweep.startedAt });

            await attachArtifact(
              testInfo,
              `alertzero-eval-token-usage-coverage-${tier}.json`,
              buildArtifact(tier, [sweep], rows)
            );

            assertRowsAreAttributable(rows, { expectedPluginIds: EXPECTED_PLUGIN_IDS });
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.some((row) => row.featureId === COVERAGE_PLUGIN_ID)).toBe(true);
          } finally {
            await sweep?.release();
            await seed.cleanup();
          }
        }
      }
    );

    apiTest(
      'measures the rule tuning sweep on the #19901 backtest scenarios',
      async ({ apiClient, samlAuth, esClient, config }, testInfo) => {
        // #19901's seeder is a bash script, so it is run as written (pinned revision, digest
        // checked) once per scenario; each scenario is one live rule with 12 closed false
        // positives, so the sweep reviews exactly one rule per scenario.
        testInfo.setTimeout(SWEEP_TIMEOUT_MS + REVIEW_TIMEOUT_MS + 5 * 60_000);
        const scenarios = parseBacktestScenarios(process.env[BACKTEST_SCENARIOS_ENV]);
        const api = await getAdminApi(apiClient, samlAuth);
        const seed = await seedBacktestScenarios(
          {
            kibanaUrl: config.hosts.kibana,
            elasticsearchUrl: config.hosts.elasticsearch,
            credentials: `${config.auth.username}:${config.auth.password}`,
          },
          { scenarios, runMarker: makeRunMarker('backtest') }
        );
        let sweep: SweepHandle | undefined;
        try {
          sweep = await runSweep(api, {
            workflowId: RULE_TUNING_SWEEP_WORKFLOW_ID,
            tier: 'large',
            timeoutMs: SWEEP_TIMEOUT_MS,
          });
          const requested = Number(sweep.outputs.reviews_requested ?? 0);
          const rows = await collectTokenUsageSettled(esClient, { since: sweep.startedAt });

          await attachArtifact(
            testInfo,
            'alertzero-eval-token-usage-tuning-backtest.json',
            { scenarios, ...buildArtifact('large', [sweep], rows) }
          );

          const diagnosis = requested === 0 ? await describeSweepDiagnosis(api, sweep.executionId) : '';
          expect(requested, `reviews_requested=${requested}\n${diagnosis}`).toBe(scenarios.length);
          assertRowsAreAttributable(rows, { expectedPluginIds: [RULE_TUNING_PLUGIN_ID] });
          expect(rows.length).toBeGreaterThan(0);
        } finally {
          await sweep?.release();
          await seed.cleanup();
        }
      }
    );
  }
);
