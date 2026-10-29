/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { EsClient } from '@kbn/scout-security';
import {
  ALERTS_INDEX,
  BACKTEST_SEED_SCRIPT_SHA256,
  BACKTEST_SEED_SCRIPT_URL,
  COVERAGE_KI_INDEX,
  COVERAGE_KI_TYPE,
  EVAL_RUN_MARKER_PREFIX,
  EVAL_SPACE_ID,
  RULE_COVERAGE_SWEEP_WORKFLOW_ID,
  RULE_COVERAGE_WORKER_ID,
  RULE_TUNING_SWEEP_WORKFLOW_ID,
  RULE_TUNING_WORKER_ID,
  SCALE_TIERS,
  TOKEN_USAGE_DATA_STREAM,
  type BacktestScenario,
  type ScaleTier,
} from '../../common/constants';
import { ok, pollUntil } from '../../../scout_alertzero_e2e/common/kbn';
import type { AlertZeroApi } from '../../../scout_alertzero_e2e/common/kbn';
import {
  createServiceAccount,
  deleteServiceAccount,
  describeExecution,
  getWorker,
  listExecutionIds,
  resetWorker,
  updateWorker,
  waitForExecution,
  waitForNewExecution,
} from '../../../scout_alertzero_e2e/api/fixtures/alertzero';
import type { WorkflowExecution } from '../../../scout_alertzero_e2e/api/fixtures/alertzero';

const INFERENCE_SETTINGS_URL = '/internal/search_inference_endpoints/settings';
const RULES_URL = '/api/detection_engine/rules';
const EXECUTIONS_URL = '/api/workflows/executions';
const WORKFLOW_RUN_URL = (workflowId: string) =>
  `/api/workflows/workflow/${encodeURIComponent(workflowId)}/run`;

/**
 * Terminal *and* parked states both end the measurement window. A review stops on its approval gate
 * after its model calls are done, so `waiting` is where a measured review is expected to sit; a
 * review that never reaches either state is a failure.
 */
const SETTLED_EXECUTION_STATUSES = [
  'completed',
  'failed',
  'cancelled',
  'timed_out',
  'skipped',
  'waiting',
  'waiting_for_input',
  'waiting_for_child',
] as const;

export const makeRunMarker = (label: string): string =>
  `${EVAL_RUN_MARKER_PREFIX}-${label}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;

/* ---------------------------------------------------------------------------------------------
 * Model tiers
 * ------------------------------------------------------------------------------------------ */

export interface InferenceFeatureSetting {
  feature_id: string;
  endpoints: Array<{ id: string }>;
}

export interface InferenceSettingsResponse {
  _meta: { id: string };
  data: { features: InferenceFeatureSetting[] };
  invalidEndpoints?: string[];
}

/**
 * EIS-served endpoints are the inference-service endpoints (`.anthropic-claude-4.5-haiku-chat_completion`)
 * and the preconfigured EIS connectors (`eis-gpt-5-6-sol`). Anything else is a local or
 * third-party connector, which the eval must not measure.
 */
export const isEisEndpointId = (id: string): boolean => id.startsWith('.') || id.startsWith('eis-');

const assertEisEndpointIds = (endpointIds: string[]): void => {
  const foreign = endpointIds.filter((id) => !isEisEndpointId(id));
  if (foreign.length > 0) {
    throw new Error(
      `Only EIS endpoints may be assigned to an AlertZero tier; got ${foreign.join(', ')}`
    );
  }
};

/**
 * Assigns one AlertZero inference tier to `endpointIds` through the same route the model-settings
 * UI calls. The response is the merged settings document, so an assignment that the server could
 * not resolve comes back as `invalidEndpoints` rather than as a silent no-op; both that and a
 * non-EIS id fail the run.
 */
export const setModelTier = async (
  api: AlertZeroApi,
  { featureId, endpointIds }: { featureId: string; endpointIds: string[] }
): Promise<InferenceSettingsResponse> => {
  assertEisEndpointIds(endpointIds);
  const current = ok(
    await api.internal<InferenceSettingsResponse>('GET', INFERENCE_SETTINGS_URL),
    'read the inference settings'
  );
  const others = (current.data?.features ?? []).filter(
    (feature) => feature.feature_id !== featureId
  );
  const response = ok(
    await api.internal<InferenceSettingsResponse>('PUT', INFERENCE_SETTINGS_URL, {
      body: {
        features: [
          ...others,
          { feature_id: featureId, endpoints: endpointIds.map((id) => ({ id })) },
        ],
      },
    }),
    `assign the ${featureId} tier`
  );
  if ((response.invalidEndpoints ?? []).length > 0) {
    throw new Error(
      `Assigning ${featureId} to ${endpointIds.join(', ')} returned invalid endpoints: ${(
        response.invalidEndpoints ?? []
      ).join(', ')}`
    );
  }
  return response;
};

/** The endpoints a tier currently resolves to; used to prove the write round-trips. */
export const getAssignedEndpoints = async (
  api: AlertZeroApi,
  featureId: string
): Promise<string[]> => {
  const settings = ok(
    await api.internal<InferenceSettingsResponse>('GET', INFERENCE_SETTINGS_URL),
    'read the inference settings'
  );
  return (
    settings.data?.features.find((feature) => feature.feature_id === featureId)?.endpoints ?? []
  ).map((endpoint) => endpoint.id);
};

/* ---------------------------------------------------------------------------------------------
 * Sweeps
 * ------------------------------------------------------------------------------------------ */

export interface SweepRun {
  readonly executionId: string;
  readonly workflowId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outputs: Record<string, unknown>;
}

/**
 * Worker id each sweep drives. The id is the PATCH URL parameter, not a settings key: `settings` is
 * `.strict()` (verified against `WorkerSettingsWrite`), and sending `workerId` inside it is a 400
 * "settings: Unrecognized key" (measured: smoke-6819fe62, smoke-599301ea, smoke-b5c7ebd3).
 */
const sweepWorkerId = (workflowId: string): string =>
  workflowId === RULE_TUNING_SWEEP_WORKFLOW_ID ? RULE_TUNING_WORKER_ID : RULE_COVERAGE_WORKER_ID;

/**
 * Settings patch that makes the enabled worker's immediate scheduled run behave like the sweep the
 * eval measures: thresholds the seeded scale tiers exceed, and (coverage) the max gaps per run the
 * tier seeds. `analysisWindowDays` / `lookbackDays` minimums are enforced by the settings contract,
 * so they stay at the schema floor. Only keys `WorkerSettingsWrite` declares: autonomy,
 * scheduleInterval, serviceAccountId, extras — `extras` is whole-object and its keys are required.
 */
const sweepSettings = (workflowId: string, tier: ScaleTier): Record<string, unknown> =>
  workflowId === RULE_TUNING_SWEEP_WORKFLOW_ID
    ? {
        autonomy: 'assisted',
        scheduleInterval: '2h',
        extras: { analysisWindowDays: 1, fpCountThreshold: 2, fpRateThresholdPct: 0 },
      }
    : {
        autonomy: 'assisted',
        scheduleInterval: '1h',
        extras: { lookbackDays: 8, maxGapsPerRun: Math.min(SCALE_TIERS[tier].gaps, 50) },
      };

/**
 * Drives a global Worker sweep the only way the product supports for managed Workers: the sweep
 * workflow's `/run` route 404s for installed managed definitions (measured: smoke-404df3c634414bf7),
 * so the worker is configured with sweep-shaped settings, a service account is bound, and enabling
 * it makes Task Manager run the sweep at once as that account — the same supported path the
 * alertzero e2e suite uses (`attack_discovery_to_isolate.spec.ts`). Returns once the sweep execution
 * settles; a non-completed status or a timeout throws (a timeout is a failure, never a skip).
 */
export const runSweep = async (
  api: AlertZeroApi,
  {
    workflowId,
    tier = 'large',
    timeoutMs,
    settledStatuses = SETTLED_EXECUTION_STATUSES,
  }: {
    workflowId: string;
    tier?: ScaleTier;
    inputs?: Record<string, unknown>;
    timeoutMs: number;
    settledStatuses?: readonly string[];
  }
): Promise<SweepRun> => {
  const workerId = sweepWorkerId(workflowId);
  const settings = sweepSettings(workflowId, tier);
  const serviceAccountId = await createServiceAccount(api);

  // The workflow is installed BY the settings save (`WorkersService.persistWorker` ->
  // `installRegisteredWorkerForRequest`), so a fresh worker legitimately carries no `workflowId`
  // until that save runs; asserting before it is what made the first head report "no workflow
  // installed". Save first, then read the id the save installed.
  const before = await getWorker(api, workerId);
  // NOT wrapped in `ok()`: `updateWorker` already returns the unwrapped WorkerRecord, and `ok()`
  // reads `{statusCode, body}` — wrapping a plain record makes it return `undefined` (measured:
  // smoke-405eff93acbf4364, "Cannot read properties of undefined (reading 'workflowId')").
  const saved = await updateWorker(api, workerId, {
    settingsRevision: before.settingsRevision ?? null,
    settings: { ...settings, serviceAccountId },
  });
  const workerWorkflowId = saved.workflowId ?? (await getWorker(api, workerId)).workflowId;
  if (!workerWorkflowId) {
    // Diagnostic payload, not just a message: a second red run must explain itself.
    throw new Error(
      `Worker ${workerId} has no workflow installed after the settings save; worker=${JSON.stringify(
        saved
      )} settings sent=${JSON.stringify(settings)}`
    );
  }
  if (!workerWorkflowId.startsWith(workflowId)) {
    throw new Error(
      `Worker ${workerId} runs workflow ${workerWorkflowId}, the eval measures ${workflowId}`
    );
  }

  try {
    const knownExecutionIds = await listExecutionIds(api, workerWorkflowId);
    const started = new Date().toISOString();
    const enabled = await updateWorker(api, workerId, { enabled: true });
    if (!enabled.enabled) {
      throw new Error(`enabling worker ${workerId} did not stick`);
    }

    const workflowExecutionId = await waitForNewExecution(
      api,
      workerWorkflowId,
      knownExecutionIds,
      { timeoutMs }
    );
    const settled = await waitForExecution(api, `${workflowId} sweep`, workflowExecutionId, {
      timeoutMs,
    });

    if (settled.status !== 'completed') {
      // Step-level detail, not just the status: the failure that matters (a step's own error) is
      // only visible in the execution's steps and its children's steps.
      const detail = await describeExecution(api, workflowExecutionId).catch(
        (error: Error) => `describeExecution failed: ${error.message}`
      );
      throw new Error(
        `Sweep ${workflowId} settled as ${settled.status}, not completed: ${JSON.stringify(
          settled.error ?? settled.cancellationReason ?? {}
        )}\n${detail}`
      );
    }

    // Workflow outputs live on `context.output` for worker executions (execution-level `output`
    // is null when the workflow ends via `workflow.output` emit steps); read both.
    const raw = settled as typeof settled & {
      finishedAt?: string;
      context?: { output?: Record<string, unknown> };
      output?: Record<string, unknown>;
    };
    return {
      executionId: workflowExecutionId,
      workflowId,
      status: settled.status,
      startedAt: settled.startedAt ?? started,
      finishedAt: raw.finishedAt ?? new Date().toISOString(),
      outputs: raw.context?.output ?? raw.output ?? {},
    };
  } finally {
    // Always disable the worker and unbind the account, even on failure: an enabled worker keeps
    // re-running on its schedule into the next test's measurement window.
    const current = await getWorker(api, workerId).catch(() => undefined);
    if (current?.enabled) {
      await updateWorker(api, workerId, { enabled: false }).catch(() => undefined);
    }
    await resetWorker(api, workerId).catch(() => undefined);
    await deleteServiceAccount(api, serviceAccountId).catch(() => undefined);
  }
};

/** The child executions a sweep fanned out to, one per review it started. */
export const listChildExecutions = async (
  api: AlertZeroApi,
  executionId: string
): Promise<Array<{ executionId: string; workflowId: string; status: string }>> =>
  ok(
    await api.public<Array<{ executionId: string; workflowId: string; status: string }>>(
      'GET',
      `${EXECUTIONS_URL}/${executionId}/children`
    ),
    `read the children of ${executionId}`
  );

/**
 * Waits for a review to settle. Reviews park on their approval gate, so "settled" includes the
 * waiting states; the point is that its model calls are done and its rows are in the window.
 */
export const waitForReview = async (
  api: AlertZeroApi,
  { executionId, timeoutMs }: { executionId: string; timeoutMs: number }
): Promise<WorkflowExecution> =>
  pollUntil(
    `review execution ${executionId} to settle`,
    async () => {
      const execution = ok(
        await api.public<WorkflowExecution>('GET', `${EXECUTIONS_URL}/${executionId}`),
        'read the review execution'
      );
      return SETTLED_EXECUTION_STATUSES.includes(
        execution.status as (typeof SETTLED_EXECUTION_STATUSES)[number]
      )
        ? execution
        : undefined;
    },
    { timeoutMs }
  );

/* ---------------------------------------------------------------------------------------------
 * Seeding
 * ------------------------------------------------------------------------------------------ */

const bulk = async (
  esClient: EsClient,
  index: string,
  docs: ReadonlyArray<{ id?: string; document: Record<string, unknown> }>
): Promise<void> => {
  if (docs.length === 0) {
    return;
  }
  const response = await esClient.bulk({
    refresh: 'wait_for',
    operations: docs.flatMap(({ id, document }) => [
      { index: { _index: index, _id: id } },
      document,
    ]),
  });
  if (response.errors) {
    throw new Error(`Seeding into ${index} failed: ${JSON.stringify(response.items.slice(0, 3))}`);
  }
};

const deleteByMarker = async (esClient: EsClient, index: string, marker: string): Promise<void> => {
  await esClient
    .deleteByQuery({
      index,
      conflicts: 'proceed',
      refresh: true,
      query: { term: { tags: marker } },
    })
    .catch((error: { statusCode?: number }) => {
      if (error.statusCode !== 404) {
        throw error;
      }
    });
};

export interface SeededTuningNoise {
  readonly runMarker: string;
  readonly ruleIds: string[];
  readonly fpAlertIds: string[];
  readonly cleanup: () => Promise<void>;
}

interface DetectionRuleResponse {
  id: string;
  rule_id: string;
  revision?: number;
}

/**
 * Seeds `rules` enabled detection rules that never match, then closes `fpPerRule` alerts per rule
 * as false positives. That is exactly the shape the tuning sweep harvests: alerts closed as
 * false positives inside the analysis window, grouped by a rule that is enabled and has no
 * in-flight review. A rule that never matches keeps the seeded alerts the only ones in play.
 */
export const seedTuningNoise = async (
  esClient: EsClient,
  api: AlertZeroApi,
  { tier, runMarker }: { tier: ScaleTier; runMarker: string }
): Promise<SeededTuningNoise> => {
  const { rules, fpPerRule } = SCALE_TIERS[tier];
  const created: DetectionRuleResponse[] = [];

  for (let index = 0; index < rules; index++) {
    const ruleId = `${runMarker}-rule-${index}`;
    const response = ok(
      await api.public<DetectionRuleResponse>('POST', RULES_URL, {
        body: {
          name: `${runMarker} noisy rule ${index}`,
          description: 'Seeded by the AlertZero token-usage eval; matches nothing by design.',
          rule_id: ruleId,
          type: 'query',
          language: 'kuery',
          enabled: true,
          index: ['logs-*'],
          query: `labels.alertzero_eval_rule: "${ruleId}"`,
          severity: 'low',
          risk_score: 21,
          // Alert suppression off and no schedule mean the rule cannot generate alerts of its own
          // between the seed and the sweep.
          interval: '1h',
          from: 'now-6m',
          to: 'now',
          max_signals: 1,
          tags: [runMarker],
        },
      }),
      `create rule ${ruleId}`
    );
    created.push(response);
  }

  const now = Date.now();
  const alerts = created.flatMap((rule, ruleIndex) =>
    Array.from({ length: fpPerRule }, (_, fpIndex) => {
      const timestamp = new Date(now - (ruleIndex * fpPerRule + fpIndex) * 60_000).toISOString();
      return {
        document: {
          '@timestamp': timestamp,
          tags: [runMarker],
          kibana: {
            alert: {
              rule: {
                uuid: rule.id,
                rule_id: rule.rule_id,
                revision: rule.revision ?? 1,
                name: `${runMarker} noisy rule ${ruleIndex}`,
              },
              workflow_status: 'closed',
              workflow_reason: 'false_positive',
              workflow_tags: ['alertzero-eval-seed'],
              building_block_type: undefined,
              severity: 'low',
              risk_score: 21,
            },
          },
        },
      };
    })
  );

  await bulk(esClient, ALERTS_INDEX, alerts);

  return {
    runMarker,
    ruleIds: created.map((rule) => rule.rule_id),
    fpAlertIds: [],
    cleanup: async () => {
      for (const rule of created) {
        await api
          .public('DELETE', `${RULES_URL}?rule_id=${encodeURIComponent(rule.rule_id)}`)
          .catch(() => undefined);
      }
      await deleteByMarker(esClient, ALERTS_INDEX, runMarker);
    },
  };
};

export interface SeededCoverageGaps {
  readonly runMarker: string;
  readonly gapIds: string[];
  readonly cleanup: () => Promise<void>;
}

/**
 * Writes `gaps` pending coverage knowledge indicators, the same document the Hunt package-report
 * step writes (same index, `type`, `attributes.status` and `attributes.space_id`), so the coverage
 * sweep finds them with its own query. Written through ES rather than by running a Hunt, because
 * the eval measures what the *coverage* sweep costs, not what producing a gap costs.
 */
export const seedCoverageGaps = async (
  esClient: EsClient,
  { tier, runMarker }: { tier: ScaleTier; runMarker: string }
): Promise<SeededCoverageGaps> => {
  const gaps = Math.min(SCALE_TIERS[tier].gaps, 50);
  const now = Date.now();
  const docs = Array.from({ length: gaps }, (_, index) => {
    const kiId = `ki-cov-${runMarker}-${index}`;
    const timestamp = new Date(now - index * 1_000).toISOString();
    const technique = `T1059.${String(index).padStart(3, '0')}`;
    return {
      id: kiId,
      document: {
        '@timestamp': timestamp,
        id: kiId,
        updated_at: timestamp,
        type: COVERAGE_KI_TYPE,
        title: `${runMarker} coverage gap ${index}`,
        description: `Seeded coverage gap ${index} for the AlertZero token-usage eval.`,
        content: `No detection rule covers technique ${technique} for the seeded ${runMarker} activity.`,
        tags: [runMarker, 'consumer:detection', 'status:pending', 'watch:hunt'],
        attributes: {
          status: 'pending',
          technique,
          report_id: `${runMarker}-report-${index}`,
          watch_id: 'hunt',
          producer: 'alertzero.eval.seed',
          space_id: EVAL_SPACE_ID,
        },
      },
    };
  });

  await bulk(esClient, COVERAGE_KI_INDEX, docs);

  return {
    runMarker,
    gapIds: docs.map((doc) => doc.id),
    cleanup: () => deleteByMarker(esClient, COVERAGE_KI_INDEX, runMarker),
  };
};

export interface SeededBacktestScenarios {
  readonly runMarker: string;
  readonly scenarios: BacktestScenario[];
  readonly cleanup: () => Promise<void>;
}

export interface BacktestSeedTarget {
  readonly kibanaUrl: string;
  readonly elasticsearchUrl: string;
  /** `user:password`, the script's `ES_CREDS`. */
  readonly credentials: string;
}

const execFileAsync = promisify(execFile);

const runSeedScript = async (
  scriptPath: string,
  target: BacktestSeedTarget,
  stateDir: string,
  args: string[]
): Promise<string> => {
  const { stdout } = await execFileAsync('bash', [scriptPath, ...args], {
    timeout: 5 * 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      KB_HOST: target.kibanaUrl,
      ES_HOST: target.elasticsearchUrl,
      ES_CREDS: target.credentials,
      CURL_HOME: stateDir,
      SPACE: EVAL_SPACE_ID,
      STATE_FILE: path.join(stateDir, `${args[1]}-${args[2]}.json`),
    },
  }).catch((error: { stdout?: string; stderr?: string; message: string }) => {
    throw new Error(
      `seed script "${args.join(' ')}" failed: ${error.message}\nstdout: ${error.stdout ?? ''}\nstderr: ${
        error.stderr ?? ''
      }`
    );
  });
  return stdout;
};

/**
 * Seeds the tuning data `#19901` prescribes by running its own script (`seed <scenario> <name>`),
 * one rule per scenario. The script creates a live rule, 12 closed false-positive alerts stamped with
 * the rule's current revision, and the source events, which is exactly what the tuning sweep
 * harvests. The script is fetched from a pinned gist revision and rejected on a digest mismatch.
 * Needs `bash`, `curl` and `jq` on the machine running the test; a missing one fails with a name.
 */
export const seedBacktestScenarios = async (
  target: BacktestSeedTarget,
  { scenarios, runMarker }: { scenarios: BacktestScenario[]; runMarker: string }
): Promise<SeededBacktestScenarios> => {
  for (const tool of ['bash', 'curl', 'jq']) {
    await execFileAsync(tool, ['--version']).catch(() => {
      throw new Error(`the #19901 seed script needs "${tool}" on the PATH of the test runner`);
    });
  }

  const response = await fetch(BACKTEST_SEED_SCRIPT_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Fetching the #19901 seed script failed: ${response.status}`);
  }
  const script = await response.text();
  const digest = createHash('sha256').update(script).digest('hex');
  if (digest !== BACKTEST_SEED_SCRIPT_SHA256) {
    throw new Error(
      `the #19901 seed script digest is ${digest}, expected ${BACKTEST_SEED_SCRIPT_SHA256}; refusing to run it`
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'alertzero-eval-seed-'));
  const scriptPath = path.join(dir, 'seed-tuning-backtests.sh');
  await writeFile(scriptPath, script, { mode: 0o700 });
  if (target.elasticsearchUrl.startsWith('https:') || target.kibanaUrl.startsWith('https:')) {
    // A local Scout stack serves a self-signed CA; the script's plain `curl -s` would reject it.
    await writeFile(path.join(dir, '.curlrc'), 'insecure\n');
  }

  const seeded: BacktestScenario[] = [];
  const cleanup = async () => {
    for (const scenario of seeded) {
      await runSeedScript(scriptPath, target, dir, ['clean', scenario, `${runMarker}-${scenario}`]).catch(
        () => undefined
      );
    }
    await rm(dir, { recursive: true, force: true });
  };

  try {
    for (const scenario of scenarios) {
      // Pushed before the run: a half-created scenario must still be cleaned.
      seeded.push(scenario);
      await runSeedScript(scriptPath, target, dir, ['seed', scenario, `${runMarker}-${scenario}`]);
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  return { runMarker, scenarios, cleanup };
};

/* ---------------------------------------------------------------------------------------------
 * Token usage
 * ------------------------------------------------------------------------------------------ */

export interface TokenUsageRow {
  readonly timestamp?: string;
  readonly connectorId?: string;
  readonly featureId?: string;
  readonly parentFeatureId?: string;
  readonly modelId?: string;
  readonly provider?: string;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

interface TokenUsageSource {
  '@timestamp'?: string;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: { model_id?: string; provider?: string };
  inference?: { connector_id?: string; feature_id?: string; parent_feature_id?: string };
}

/**
 * Reads the token rows written inside a sweep's window. The eval dumps both the raw rows and the
 * per-sweep times into its artifact, so a reader can re-derive any number from the file alone.
 */
export const collectTokenUsage = async (
  esClient: EsClient,
  { since, until }: { since: string; until: string }
): Promise<TokenUsageRow[]> => {
  const response = await esClient.search<TokenUsageSource>({
    index: TOKEN_USAGE_DATA_STREAM,
    size: 2000,
    sort: [{ '@timestamp': 'asc' }],
    query: {
      bool: { filter: [{ range: { '@timestamp': { gte: since, lte: until } } }] },
    },
  });

  return response.hits.hits.map((hit) => ({
    timestamp: hit._source?.['@timestamp'],
    connectorId: hit._source?.inference?.connector_id,
    featureId: hit._source?.inference?.feature_id,
    parentFeatureId: hit._source?.inference?.parent_feature_id,
    modelId: hit._source?.model?.model_id,
    provider: hit._source?.model?.provider,
    promptTokens: hit._source?.token_usage?.prompt_tokens,
    completionTokens: hit._source?.token_usage?.completion_tokens,
    totalTokens: hit._source?.token_usage?.total_tokens,
  }));
};

/**
 * Adds a settled read: a sweep's `start_reviews` foreach STARTS child reviews and returns, so rows
 * keep arriving after the sweep execution completes (measured: smoke-c6f1764679d04a23 — 50 review
 * children started in 53s, sweep test itself took 8.8 min). Poll until the row count stops growing
 * for `quietMs`, so the dump is not a snapshot of a still-running fan-out.
 */
export const collectTokenUsageSettled = async (
  esClient: EsClient,
  { since, quietMs = 45_000, timeoutMs = 6 * 60_000 }: { since: string; quietMs?: number; timeoutMs?: number }
): Promise<TokenUsageRow[]> => {
  const deadline = Date.now() + timeoutMs;
  let lastCount = -1;
  let lastChange = Date.now();
  let rows: TokenUsageRow[] = [];
  for (;;) {
    rows = await collectTokenUsage(esClient, { since, until: new Date().toISOString() });
    if (rows.length !== lastCount) {
      lastCount = rows.length;
      lastChange = Date.now();
    }
    const quiet = Date.now() - lastChange >= quietMs;
    if ((quiet && rows.length > 0) || Date.now() >= deadline) {
      return rows;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
};

/**
 * Why a sweep produced nothing: the worker's own step outputs. A harvest that found no rows and a
 * harvest that found rows but no candidates both end as `reviews_requested: 0`, and only the step
 * outputs say which. Truncated hard — this rides in a failure message.
 */
export const describeSweepDiagnosis = async (
  api: AlertZeroApi,
  executionId: string
): Promise<string> => {
  try {
    const execution = ok(
      await api.public<WorkflowExecution & { stepExecutions?: Array<Record<string, unknown>> }>(
        'GET',
        `${EXECUTIONS_URL}/${executionId}`
      ),
      'read the sweep execution for diagnosis'
    );
    return (execution.stepExecutions ?? [])
      .filter((step) => {
        const id = String(step.stepId ?? '');
        return /harvest|candidate|fanout|dispatch|review/i.test(id);
      })
      .map((step) => {
        const detail = JSON.stringify({
          stepId: step.stepId,
          status: step.status,
          error: step.error,
          output: step.output,
        });
        return `${String(step.stepId)}: ${detail.slice(0, 700)}`;
      })
      .join('\n');
  } catch (error) {
    return `could not read the sweep execution for diagnosis: ${(error as Error).message}`;
  }
};

/**
 * Structural checks the eval asserts on every row: it was attributed to a Worker (`feature_id` is
 * one of the workflow step plugin-ids) and it was served by an EIS endpoint. A row that fails
 * either is a missing-attribution failure, not a measurement to average over.
 */
export const assertRowsAreAttributable = (
  rows: TokenUsageRow[],
  { expectedPluginIds }: { expectedPluginIds: readonly string[] }
): void => {
  const unattributed = rows.filter(
    (row) => row.featureId === undefined || !expectedPluginIds.includes(row.featureId)
  );
  if (unattributed.length > 0) {
    throw new Error(
      `${unattributed.length} of ${
        rows.length
      } token rows carry no expected plugin-id (expected one of ${expectedPluginIds.join(
        ', '
      )}): ${JSON.stringify(unattributed.slice(0, 3))}`
    );
  }
  const nonEis = rows.filter((row) => !isEisEndpointId(row.connectorId ?? ''));
  if (nonEis.length > 0) {
    throw new Error(
      `${nonEis.length} of ${
        rows.length
      } token rows were not served by an EIS endpoint: ${JSON.stringify(nonEis.slice(0, 3))}`
    );
  }
};

export const sumTokens = (rows: TokenUsageRow[]): number =>
  rows.reduce((total, row) => total + (row.totalTokens ?? 0), 0);

export interface TokenUsageArtifact {
  readonly tier: ScaleTier;
  readonly rows: TokenUsageRow[];
  readonly sweeps: Array<{
    name: string;
    executionId: string;
    workflowId: string;
    status: string;
    startedAt: string;
    finishedAt: string;
    outputs: Record<string, unknown>;
  }>;
  readonly byPluginId: Record<string, { rows: number; totalTokens: number }>;
}

/**
 * The slice of Playwright's `TestInfo` this module uses. Security-solution tests may not import
 * from `@playwright/test` directly, and the real `testInfo` satisfies this structurally.
 */
export interface AttachmentTarget {
  attach: (name: string, options: { body: Buffer; contentType: string }) => Promise<void>;
}

/** Attaches the artifact to the Playwright report, which the cell lane ships back as a tarball. */
export const attachArtifact = async (
  testInfo: AttachmentTarget,
  name: string,
  payload: unknown
): Promise<void> => {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
};

export const buildArtifact = (
  tier: ScaleTier,
  sweeps: SweepRun[],
  rows: TokenUsageRow[]
): TokenUsageArtifact => {
  const byPluginId: TokenUsageArtifact['byPluginId'] = {};
  for (const row of rows) {
    const featureId = row.featureId ?? 'unattributed';
    const entry = byPluginId[featureId] ?? { rows: 0, totalTokens: 0 };
    entry.rows += 1;
    entry.totalTokens += row.totalTokens ?? 0;
    byPluginId[featureId] = entry;
  }
  return {
    tier,
    rows,
    sweeps: sweeps.map((sweep) => ({
      name: sweep.workflowId,
      executionId: sweep.executionId,
      workflowId: sweep.workflowId,
      status: sweep.status,
      startedAt: sweep.startedAt,
      finishedAt: sweep.finishedAt,
      outputs: sweep.outputs,
    })),
    byPluginId,
  };
};
