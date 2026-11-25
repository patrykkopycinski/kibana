/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import { createFlagError } from '@kbn/dev-cli-errors';
import type { Command } from '@kbn/dev-cli-runner';
import { KbnClient } from '@kbn/kbn-client';
import { summarizeTraceSpans } from '@kbn/evals-common';
import type { TraceSummary } from '@kbn/evals-common';
import { EvalsClient } from '../../utils/evals_client';
import { getEvaluationsKbnClient } from '../../utils/evaluations_kbn_client';
import { getSpaceIdsFromEnv } from '../../utils/space_ids';
import { readSpaceIdsFlag } from '../run_helpers';
import type {
  StoredExampleDetails,
  TranscriptExperiment,
  TranscriptHydration,
} from '../../utils/reporting/transcript_report';
import {
  buildTranscriptReport,
  collectRepetitionRefs,
  DEFAULT_SORT_EVALUATOR,
  expectedOutputsByExample,
  filterToOverlappingDatasets,
  renderTranscriptHtml,
  renderTranscriptMarkdown,
  repetitionKey,
} from '../../utils/reporting/transcript_report';

const DEFAULT_EVAL_KBN_URL = 'http://elastic:changeme@localhost:5601';
const FETCH_CONCURRENCY = 4;
const RETRY_DELAY_MS = 1000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `task` once more after a short wait when the first attempt throws. */
const withOneRetry = async <T>(task: () => Promise<T>): Promise<T> => {
  try {
    return await task();
  } catch (firstError) {
    await sleep(RETRY_DELAY_MS);
    return task();
  }
};

/** Maps `items` with at most `limit` calls in flight; each result is the value or the error. */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> => {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(
    items.length
  );
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await fn(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

export const transcriptCmd: Command<void> = {
  name: 'transcript',
  description: `
  Print the same examples of two or more experiments side by side: the question, the expected
  answer, each experiment's answer per repetition, its tool trail, token totals and evaluator
  scores. Examples are sorted by the largest score gap between the experiments.

  Usage:
    node scripts/evals transcript <experiment-id> <experiment-id> [<experiment-id> ...]

  Options:
    --format          Output format: "md" (default) or "html"
    --output          Write the report to a file instead of stdout
    --sort-evaluator  Evaluator whose per-example gap orders the examples (default "${DEFAULT_SORT_EVALUATOR}")
    --suite           Suite ID; resolves base build IDs to full experiment IDs and filters scores
    --space-ids       Spaces the experiments were run in (same value as "evals run")

  Environment:
    EVAL_KBN_URL      Target Kibana URL (defaults to localhost)
    EVAL_KBN_API_KEY  API key for authenticating to the target Kibana
    EVAL_SPACE_IDS    Spaces the experiments were run in (same as --space-ids)
  `,
  flags: {
    string: ['format', 'output', 'sort-evaluator', 'suite', 'space-ids'],
    help: `
      --format          "md" (default) or "html"
      --output          Write the report to a file instead of stdout
      --sort-evaluator  Evaluator whose gap orders the examples (default "${DEFAULT_SORT_EVALUATOR}")
      --suite           Suite ID; resolves base build IDs and filters scores
      --space-ids       Spaces the experiments were run in
    `,
  },
  run: async ({ log, flagsReader }) => {
    const positionals = flagsReader.getPositionals();
    const format = flagsReader.string('format') ?? 'md';
    const outputPath = flagsReader.string('output');
    const sortEvaluator = flagsReader.string('sort-evaluator') ?? DEFAULT_SORT_EVALUATOR;
    const suiteId = flagsReader.string('suite');
    const spaceIds = readSpaceIdsFlag(flagsReader) ?? getSpaceIdsFromEnv();

    if (format !== 'md' && format !== 'html') {
      throw createFlagError('--format must be "md" or "html".');
    }

    if (positionals.length < 2) {
      throw createFlagError(
        'At least two experiment IDs are required. Example: node scripts/evals transcript <experiment-id> <experiment-id>. Configure target Kibana with EVAL_KBN_URL and EVAL_KBN_API_KEY.'
      );
    }

    const evaluationsKbnUrl = process.env.EVAL_KBN_URL;
    if (!evaluationsKbnUrl) {
      log.warning(`EVAL_KBN_URL not set; defaulting to ${DEFAULT_EVAL_KBN_URL}.`);
    }

    const defaultKbnClient = new KbnClient({ log, url: DEFAULT_EVAL_KBN_URL });
    const kbnClient = getEvaluationsKbnClient({
      kbnClient: defaultKbnClient,
      log,
      evaluationsKbnUrl,
      evaluationsKbnApiKey: process.env.EVAL_KBN_API_KEY,
    });
    const evalsClient = new EvalsClient(kbnClient, log, { spaceIds });

    try {
      await evalsClient.assertPluginEnabled();
    } catch (error) {
      throw createFlagError(
        [
          error instanceof Error ? error.message : String(error),
          'Set EVAL_KBN_URL to a Kibana instance with xpack.evals.enabled=true and xpack.evals.mode=full.',
          'Set EVAL_KBN_API_KEY when authenticating to a non-local target.',
        ].join('\n')
      );
    }

    try {
      await evalsClient.assertSpacesExist();
    } catch (error) {
      throw createFlagError(error instanceof Error ? error.message : String(error));
    }

    // A base build ID (no "::" parts) is resolved to the full composite execution ID so the
    // server's exact-term metadata.execution_id query finds the scores.
    const experimentIds = await Promise.all(
      positionals.map(async (id) => {
        if (!suiteId || id.includes('::')) return id;
        const resolved = await evalsClient.findLatestExperimentForBuild({
          suiteId,
          baseExecutionId: id,
        });
        if (resolved) {
          log.info(`Resolved experiment ${id} → ${resolved.executionId}`);
          return resolved.executionId;
        }
        log.warning(`Could not resolve experiment for base ID "${id}"; using raw ID.`);
        return id;
      })
    );

    const loaded = await Promise.all(
      experimentIds.map(async (experimentId): Promise<TranscriptExperiment> => {
        const { scores, capped } = await evalsClient.getExperimentScoresWithTotal(
          experimentId,
          suiteId ? { suiteId, executionId: experimentId } : undefined
        );
        if (scores.length === 0) {
          throw new Error(`No scores found for experiment ID: ${experimentId}`);
        }
        return { experimentId, scores, capped };
      })
    );

    const experiments = filterToOverlappingDatasets(loaded);
    if (experiments.every((experiment) => experiment.scores.length === 0)) {
      throw new Error('No overlapping datasets found between the experiments.');
    }
    log.info(
      `Found ${
        new Set(experiments.flatMap((e) => e.scores.map((s) => s.example.dataset.id))).size
      } overlapping dataset(s).`
    );

    // Stored input/output per repetition. Missing output is not an error: the trace is the fallback.
    const refs = collectRepetitionRefs(experiments);
    log.info(`Reading stored output for ${refs.length} example repetition(s)...`);
    const details = new Map<string, StoredExampleDetails | null>();
    const detailResults = await mapWithConcurrency(refs, FETCH_CONCURRENCY, (ref) =>
      withOneRetry(() =>
        evalsClient.getExperimentExampleDetails(
          ref.experimentId,
          ref.datasetId,
          ref.exampleId,
          ref.repetitionIndex,
          { executionId: ref.experimentId }
        )
      )
    );
    let detailFailures = 0;
    detailResults.forEach((result, index) => {
      const key = repetitionKey(refs[index]);
      if (!result.ok) {
        detailFailures++;
        details.set(key, null);
        return;
      }
      const { example, task } = result.value;
      details.set(key, { input: example.input ?? null, output: task.output ?? null });
    });
    if (detailFailures > 0) {
      log.warning(
        `Could not read stored output for ${detailFailures} repetition(s); falling back to traces.`
      );
    }

    // Traces are only needed where stored output has no answer or no tool trail, but tokens only
    // exist on traces, so read every trace once.
    const traceModels = new Map<string, string | undefined>();
    for (const { scores } of experiments) {
      for (const { task } of scores) {
        if (task.trace_id && !traceModels.has(task.trace_id)) {
          traceModels.set(task.trace_id, task.model?.id);
        }
      }
    }
    const traceIds = [...traceModels.keys()];
    log.info(`Reading ${traceIds.length} trace(s)...`);
    const traces = new Map<string, TraceSummary | null>();
    const traceResults = await mapWithConcurrency(traceIds, FETCH_CONCURRENCY, (traceId) =>
      withOneRetry(() => evalsClient.getTrace(traceId))
    );
    let traceFailures = 0;
    traceResults.forEach((result, index) => {
      const traceId = traceIds[index];
      if (!result.ok) {
        traceFailures++;
        traces.set(traceId, null);
        return;
      }
      traces.set(traceId, summarizeTraceSpans(result.value, traceModels.get(traceId)) ?? null);
    });
    if (traceFailures > 0) {
      log.warning(`Could not read ${traceFailures} trace(s); they are shown as unavailable.`);
    }

    // Expected answers come from the dataset definition.
    const datasetIds = [...new Set(refs.map((ref) => ref.datasetId))];
    const expected = new Map<string, unknown>();
    for (const datasetId of datasetIds) {
      const dataset = await evalsClient.getDatasetById(datasetId);
      if (!dataset) {
        log.warning(`Dataset ${datasetId} was not found; its expected answers are omitted.`);
        continue;
      }
      expectedOutputsByExample(datasetId, dataset.examples).forEach((output, key) =>
        expected.set(key, output)
      );
    }

    const hydration: TranscriptHydration = { details, traces, expected };
    const report = buildTranscriptReport({ experiments, hydration, sortEvaluator });
    for (const warning of report.warnings) {
      log.warning(warning);
    }

    const rendered =
      format === 'html' ? renderTranscriptHtml(report) : renderTranscriptMarkdown(report);

    if (outputPath) {
      Fs.writeFileSync(outputPath, rendered);
      log.info(`Transcript report written to ${outputPath}`);
    } else {
      process.stdout.write(rendered);
    }
  },
};
