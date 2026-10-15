/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Volume eval for the managed `system-security-alert-analysis` workflow (card t_3b083536).
 *
 * Three sizes, each ONE rule execution handed to the workflow in one run:
 *   - S1 `aa-eval-batch-50`   50 alerts  = exactly one full batch (`consts.batch_size`).
 *   - S2 `aa-eval-vol-120`    120 alerts = 50 + 50 + a partial batch of 20 (three model calls).
 *   - S3 `aa-eval-vol-60-dup` 60 alerts  = 30 near-duplicate pairs (same rule + host, ids one hex
 *                              character apart) → two model calls (50 + 10).
 *
 * The task returns EVERY classification call (`ai.agent` or `ai.prompt`) with its status, error
 * text, raw verdict ids, token usage and latency, plus the execution's warn/error log lines, so the
 * report can answer per call: did the provider reject the request (EIS 400), did the model
 * over-generate, and did every alert end up with exactly one verdict.
 *
 * Evaluators are CODE only (`VolumeIntegrity`, `VolumeCoverage`, `VolumeCallErrors`,
 * `VolumeClassificationAccuracy`); none is averaged into another.
 *
 * Experiment names carry the `alertzero-volume-` prefix.
 */

import { randomBytes } from 'crypto';
import { tags } from '@kbn/scout';
import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import { selectEvaluators, type EvaluationDataset, type Example } from '@kbn/evals';
import { evaluate } from '../src/evaluate';
import type { ClassificationMethod } from '../src/workflow_task';
import { configureAlertAnalysisWorkflow } from '../src/space_config';
import { ALERT_ANALYSIS_EVAL_BATCHES, buildBatchAlerts } from '../src/batch_alerts';
import {
  ALERT_ANALYSIS_VOLUME_BATCHES,
  VOLUME_BATCH_SIZE,
  buildVolumeBatchAlerts,
} from '../src/volume_batches';
import { runAlertAnalysisVolumeWorkflow } from '../src/volume_task';
import { VOLUME_EVALUATORS, type VolumeTaskOutput } from '../src/volume_evaluators';
import { ALERTS_INDEX } from '../src/constants';
import type { LabeledAlert } from '../src/synthetic_alerts';

interface VolumeExample extends Example {
  input: { batchId: string };
  output: { alertCount: number };
  metadata: { batchId: string; alertIndex: string; alertCount: number; size: string };
}

const FULL_BATCH = ALERT_ANALYSIS_EVAL_BATCHES.find((batch) => batch.id === 'aa-eval-batch-50');

const SIZES: Array<{ size: string; batchId: string; alertCount: number; build: (tag: string) => LabeledAlert[] }> = [
  ...(FULL_BATCH
    ? [
        {
          size: 'S1',
          batchId: FULL_BATCH.id,
          alertCount: FULL_BATCH.alerts.length,
          build: (tag: string) => buildBatchAlerts(FULL_BATCH, tag),
        },
      ]
    : []),
  ...ALERT_ANALYSIS_VOLUME_BATCHES.map((batch) => ({
    size: batch.id === 'aa-eval-vol-120' ? 'S2' : 'S3',
    batchId: batch.id,
    alertCount: batch.alerts.length,
    build: (tag: string) => buildVolumeBatchAlerts(batch, tag),
  })),
];

const BUILD_BY_ID = new Map(SIZES.map((s) => [s.batchId, s]));

evaluate.describe(
  'Alert Analysis Workflow — volume',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    // 3 sizes x reps, each up to ~3 model calls of 50 verdicts: far beyond the default budget.
    evaluate.describe.configure({ timeout: 6 * 60 * 60_000 });

    const createdAlertIds = new Set<string>();

    evaluate.afterAll(async ({ esClient, log }: { esClient: EsClient; log: ToolingLog }) => {
      if (createdAlertIds.size === 0) {
        return;
      }
      log.info(`Deleting ${createdAlertIds.size} leftover alert-analysis volume eval alerts`);
      await esClient.deleteByQuery({
        index: ALERTS_INDEX,
        query: { ids: { values: [...createdAlertIds] } },
        refresh: true,
        conflicts: 'proceed',
      });
    });

    const METHODS: Array<{
      method: ClassificationMethod;
      title: string;
      datasetName: string;
      experimentName: string;
    }> = [
      {
        method: 'agent',
        title: 'classifies every alert at volume with ai.agent',
        datasetName: 'security: alert-analysis-workflow-volume',
        experimentName: 'alertzero-volume-alert-analysis-agent',
      },
      {
        method: 'prompt',
        title: 'classifies every alert at volume with ai.prompt',
        datasetName: 'security: alert-analysis-workflow-volume (prompt)',
        experimentName: 'alertzero-volume-alert-analysis-prompt',
      },
    ];

    const onlyMethod = process.env.AA_VOLUME_METHOD;

    METHODS.filter(({ method }) => !onlyMethod || onlyMethod === method).forEach(
      ({ method, title, datasetName, experimentName }) => {
        evaluate(title, async ({ executorClient, esClient, fetch, log, connector }) => {
          evaluate.setTimeout(6 * 60 * 60_000);
          await configureAlertAnalysisWorkflow({
            fetch,
            log,
            connectorId: connector.id,
            agentId: agentBuilderDefaultAgentId,
            usePrompt: method === 'prompt',
          });

          const examples: VolumeExample[] = SIZES.map(({ size, batchId, alertCount }) => ({
            id: batchId,
            input: { batchId },
            output: { alertCount },
            metadata: { batchId, alertIndex: ALERTS_INDEX, alertCount, size },
          }));

          log.info(
            `Volume run via ${method}: ${examples
              .map((e) => `${e.metadata.size}=${e.metadata.alertCount}`)
              .join(', ')}`
          );

          await executorClient.runExperiment(
            {
              name: experimentName,
              metadata: { classificationMethod: method, card: 't_3b083536' },
              // One execution at a time: the workflow runs alert batches serially anyway, and
              // parallel 120-alert executions would only contend for the same connector.
              concurrency: 1,
              datasets: [
                {
                  name: datasetName,
                  description:
                    'One rule execution per example: 50 alerts (one full batch), 120 alerts ' +
                    '(50+50+20), 60 alerts in 30 near-duplicate pairs. Grades every ' +
                    `${method === 'agent' ? 'ai.agent' : 'ai.prompt'} call of the execution.`,
                  examples,
                } satisfies EvaluationDataset,
              ],
              task: async ({ metadata }): Promise<VolumeTaskOutput> => {
                const { batchId, alertIndex } = metadata as { batchId: string; alertIndex: string };
                const spec = BUILD_BY_ID.get(batchId);
                if (!spec) {
                  throw new Error(`No volume batch found for id ${batchId}`);
                }
                const runTag = randomBytes(4).toString('hex');
                const alerts = spec.build(runTag);
                alerts.forEach((alert) => createdAlertIds.add(alert.id));

                const bulk = await esClient.bulk({
                  refresh: 'wait_for',
                  operations: alerts.flatMap((alert) => [
                    { index: { _index: alertIndex, _id: alert.id } },
                    alert.doc,
                  ]),
                });
                if (bulk.errors) {
                  const failed = bulk.items.filter((item) => item.index?.error);
                  throw new Error(
                    `Seeding ${batchId} failed for ${failed.length}/${alerts.length} alerts: ${JSON.stringify(
                      failed[0]?.index?.error
                    )}`
                  );
                }

                try {
                  const result = await runAlertAnalysisVolumeWorkflow({
                    fetch,
                    log,
                    alertIds: alerts.map((alert) => alert.id),
                    alertIndex,
                    classificationMethod: method,
                  });
                  return {
                    batchId,
                    alerts: alerts.map(({ id, expected }) => ({ id, expected })),
                    batchSize: VOLUME_BATCH_SIZE,
                    executionId: result.executionId,
                    executionStatus: result.executionStatus,
                    executionError: result.executionError,
                    executionDurationMs: result.executionDurationMs,
                    classificationMethod: method,
                    calls: result.calls,
                    diagnosticSteps: result.diagnosticSteps,
                    logLines: result.logLines,
                    totalLogLines: result.totalLogLines,
                  };
                } finally {
                  await esClient
                    .deleteByQuery({
                      index: alertIndex,
                      query: { ids: { values: alerts.map((alert) => alert.id) } },
                      refresh: true,
                      conflicts: 'proceed',
                    })
                    .then(() => alerts.forEach((alert) => createdAlertIds.delete(alert.id)))
                    .catch(() => {
                      // Left in createdAlertIds; afterAll sweeps them.
                    });
                }
              },
            },
            selectEvaluators(VOLUME_EVALUATORS)
          );
        });
      }
    );
  }
);
