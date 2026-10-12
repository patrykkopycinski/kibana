/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout-security';
import {
  ALERTS_GIST_URL_ENV,
  ALERTS_INDEX,
  COVERAGE_KI_INDEX,
  COVERAGE_KI_TYPE,
  EVAL_RUN_MARKER_PREFIX,
  EVAL_SPACE_ID,
  SCALE_TIERS,
  TOKEN_USAGE_DATA_STREAM,
  type ScaleTier,
} from '../../common/constants';
import { ok, pollUntil } from '../../../scout_alertzero_e2e/common/kbn';
import type { AlertZeroApi } from '../../../scout_alertzero_e2e/common/kbn';
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
 * Starts a global sweep by hand (its only trigger is manual) and polls it to a state that ends the
 * measurement window. A failure to start, a non-`completed` sweep or a timeout throws: the eval
 * measures a sweep that ran, and a timeout is a failure, never a skip.
 */
export const runSweep = async (
  api: AlertZeroApi,
  {
    workflowId,
    inputs,
    timeoutMs,
    settledStatuses = SETTLED_EXECUTION_STATUSES,
  }: {
    workflowId: string;
    inputs: Record<string, unknown>;
    timeoutMs: number;
    settledStatuses?: readonly string[];
  }
): Promise<SweepRun> => {
  const started = new Date().toISOString();
  const { workflowExecutionId } = ok(
    await api.public<{ workflowExecutionId: string }>('POST', WORKFLOW_RUN_URL(workflowId), {
      body: { inputs },
    }),
    `start the ${workflowId} sweep`
  );

  const settled = await pollUntil(
    `${workflowId} to settle`,
    async () => {
      const execution = ok(
        await api.public<WorkflowExecution>('GET', `${EXECUTIONS_URL}/${workflowExecutionId}`),
        'read the sweep execution'
      );
      return settledStatuses.includes(execution.status) ? execution : undefined;
    },
    { timeoutMs }
  );

  if (settled.status !== 'completed') {
    throw new Error(
      `Sweep ${workflowId} settled as ${settled.status}, not completed: ${JSON.stringify(
        settled.error ?? settled.cancellationReason ?? {}
      )}`
    );
  }

  return {
    executionId: workflowExecutionId,
    workflowId,
    status: settled.status,
    startedAt: settled.startedAt ?? started,
    finishedAt: settled.finishedAt ?? new Date().toISOString(),
    outputs: settled.output ?? {},
  };
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

export interface SeededGistAlerts {
  readonly source: 'gist';
  readonly count: number;
}

/**
 * Seeds the alerts the eval measures against from the `#19901` gist. The gist is the one
 * out-of-repo input this eval has, so it is named by URL in `ALERTZERO_EVAL_ALERTS_GIST_URL`
 * rather than pinned in source. Returns `undefined` when no URL is set, which lets the caller fall
 * back to the in-repo AD2 scenario seeder; a URL that is set but unusable throws.
 */
export const seedAlertDocsFromGist = async (
  esClient: EsClient,
  { runMarker }: { runMarker: string }
): Promise<SeededGistAlerts | undefined> => {
  const url = process.env[ALERTS_GIST_URL_ENV]?.trim();
  if (!url) {
    return undefined;
  }

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Fetching ${ALERTS_GIST_URL_ENV} (${url}) failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  const documents: Array<Record<string, unknown>> = Array.isArray(payload)
    ? (payload as Array<Record<string, unknown>>)
    : Array.isArray((payload as { alerts?: unknown }).alerts)
    ? (payload as { alerts: Array<Record<string, unknown>> }).alerts ?? []
    : [];
  if (documents.length === 0) {
    throw new Error(`${ALERTS_GIST_URL_ENV} (${url}) carried no alerts`);
  }

  await bulk(
    esClient,
    ALERTS_INDEX,
    documents.map((document) => ({
      document: { ...document, tags: [...((document.tags as string[]) ?? []), runMarker] },
    }))
  );

  return { source: 'gist', count: documents.length };
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
