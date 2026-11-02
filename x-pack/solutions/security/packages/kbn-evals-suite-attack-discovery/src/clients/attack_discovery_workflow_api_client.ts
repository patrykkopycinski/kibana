/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Client for the workflow-based Attack Discovery pipeline.
 *
 *   1. enable the `securitySolution:enableAttackDiscoveryWorkflows` setting (once), and try to
 *      enable `genAiSettings:tokenUsageTracking`; the latter never fails the run, its final
 *      state is reported as `tokenUsageTrackingEnabled`
 *   2. POST /internal/attack_discovery/_generate → { execution_uuid } (fire-and-forget)
 *   3. poll GET /internal/attack_discovery/executions/{id}/tracking until the
 *      validation workflow run reaches a terminal status; any tracked run that
 *      ends failed/cancelled ends the poll as a failure
 *   4. read `validated_discoveries` from the generation pipeline data
 *
 * Unlike {@link AttackDiscoveryGenerateApiClient}, this runs the managed
 * alert-retrieval / gate / generation / validation workflows, so it can set
 * `workflow_config` (e.g. `ground_truth_gate_enabled`).
 *
 * The tracking response has no report workflow run id: the report is scheduled
 * in the background after generation and is not part of `workflowRuns`.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { KbnClientRequesterError } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscovery } from '@kbn/elastic-assistant-common';

const INTERNAL_API_VERSION = '1';
const WORKFLOWS_API_VERSION = '2023-10-31';
const SETTINGS_ROUTE = '/internal/kibana/settings';
const GENERATE_ROUTE = '/internal/attack_discovery/_generate';
const AD_WORKFLOWS_SETTING = 'securitySolution:enableAttackDiscoveryWorkflows';
const TOKEN_USAGE_TRACKING_SETTING = 'genAiSettings:tokenUsageTracking';

const DEFAULT_ALERTS_INDEX = '.alerts-security.alerts-default';
const DEFAULT_SIZE = 100;
const DEFAULT_START = 'now-24h';
const DEFAULT_END = 'now';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_MAX_WAIT_MS = 1500_000;

const RUN_SUCCESS_STATUSES = new Set(['completed']);
const RUN_FAILURE_STATUSES = new Set(['failed', 'cancelled']);

// A 401/403/… can never succeed on retry; 404 (not indexed yet) and 5xx/network are retried.
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 405, 410, 499, 501]);

export interface WorkflowApiOptions {
  readonly connectorId: string;
  readonly actionTypeId?: string;
  readonly modelId?: string;
  readonly alertsIndexPattern?: string;
  readonly size?: number;
  readonly start?: string;
  readonly end?: string;
  /** Passed through verbatim as the route's snake_case `workflow_config`. */
  readonly workflowConfig?: Record<string, unknown>;
}

export interface WorkflowRuns {
  readonly alertRetrieval: string[];
  readonly gate: string[];
  readonly generation?: string;
  readonly validation?: string;
}

export interface WorkflowApiResult {
  readonly discoveries: AttackDiscovery[];
  readonly executionUuid: string;
  readonly status: string;
  readonly workflowRuns: WorkflowRuns;
  /** ISO timestamp taken before the generate request; lower bound for time-window queries. */
  readonly startedAt: string;
  /** Whether `genAiSettings:tokenUsageTracking` was on after setup; false also when unknown. */
  readonly tokenUsageTrackingEnabled: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

export interface WorkflowApiClientTiming {
  readonly pollIntervalMs?: number;
  readonly pollMaxWaitMs?: number;
}

interface TrackedWorkflow {
  workflow_id?: string;
  workflow_run_id?: string;
}

interface TrackingResponse {
  alert_retrieval?: TrackedWorkflow[] | null;
  gate?: TrackedWorkflow[] | null;
  generation?: TrackedWorkflow | null;
  validation?: TrackedWorkflow | null;
}

const statusOf = (e: unknown): number | undefined => {
  const err = e as Partial<KbnClientRequesterError> & { response?: { status?: unknown } };
  if (typeof err?.status === 'number') return err.status;
  return typeof err?.response?.status === 'number' ? err.response.status : undefined;
};

const messageOf = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 800);

/** `HTTP <status>: <message>` when there is a status, else just the message. */
const describeError = (e: unknown): string => {
  const status = statusOf(e);
  return status === undefined ? messageOf(e) : `HTTP ${status}: ${messageOf(e)}`;
};

const runIdsOf = (entries: TrackedWorkflow[] | null | undefined): string[] =>
  (entries ?? []).flatMap((entry) => (entry.workflow_run_id ? [entry.workflow_run_id] : []));

const toWorkflowRuns = (tracking: TrackingResponse | null): WorkflowRuns => ({
  alertRetrieval: runIdsOf(tracking?.alert_retrieval),
  gate: runIdsOf(tracking?.gate),
  ...(tracking?.generation?.workflow_run_id
    ? { generation: tracking.generation.workflow_run_id }
    : {}),
  ...(tracking?.validation?.workflow_run_id
    ? { validation: tracking.validation.workflow_run_id }
    : {}),
});

const allRunIds = ({ alertRetrieval, gate, generation, validation }: WorkflowRuns): string[] => [
  ...alertRetrieval,
  ...gate,
  ...(generation ? [generation] : []),
  ...(validation ? [validation] : []),
];

/** Maps pipeline `validated_discoveries` (snake_case) to the harness `AttackDiscovery` shape. */
const toDiscoveries = (validated: unknown): AttackDiscovery[] => {
  if (!Array.isArray(validated)) return [];
  return validated.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      title: typeof d.title === 'string' ? d.title : '',
      summaryMarkdown: typeof d.summary_markdown === 'string' ? d.summary_markdown : '',
      detailsMarkdown: typeof d.details_markdown === 'string' ? d.details_markdown : '',
      ...(typeof d.entity_summary_markdown === 'string'
        ? { entitySummaryMarkdown: d.entity_summary_markdown }
        : {}),
      alertIds: Array.isArray(d.alert_ids) ? (d.alert_ids as string[]) : [],
    } as AttackDiscovery;
  });
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class AttackDiscoveryWorkflowApiClient {
  private readonly pollIntervalMs: number;
  private readonly pollMaxWaitMs: number;
  private workflowsSettingEnabled = false;

  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    timing: WorkflowApiClientTiming = {}
  ) {
    this.pollIntervalMs = timing.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollMaxWaitMs = timing.pollMaxWaitMs ?? DEFAULT_POLL_MAX_WAIT_MS;
  }

  async generate(opts: WorkflowApiOptions): Promise<WorkflowApiResult> {
    const t0 = Date.now();
    const startedAt = new Date(t0).toISOString();
    const empty: WorkflowRuns = { alertRetrieval: [], gate: [] };
    let tokenUsageTrackingEnabled = false;
    const failure = (error: string, executionUuid = '', workflowRuns = empty) => ({
      discoveries: [],
      executionUuid,
      status: 'failed',
      workflowRuns,
      startedAt,
      tokenUsageTrackingEnabled,
      latencyMs: Date.now() - t0,
      error,
    });

    try {
      await this.ensureWorkflowsSetting();
    } catch (e) {
      return failure(`enable workflows setting failed: ${describeError(e)}`);
    }
    tokenUsageTrackingEnabled = await this.ensureTokenUsageTracking();

    const body: Record<string, unknown> = {
      alerts_index_pattern: opts.alertsIndexPattern ?? DEFAULT_ALERTS_INDEX,
      api_config: {
        connector_id: opts.connectorId,
        action_type_id: opts.actionTypeId ?? '.inference',
        ...(opts.modelId ? { model: opts.modelId } : {}),
      },
      size: opts.size ?? DEFAULT_SIZE,
      start: opts.start ?? DEFAULT_START,
      end: opts.end ?? DEFAULT_END,
      ...(opts.workflowConfig ? { workflow_config: opts.workflowConfig } : {}),
    };

    let executionUuid: string;
    try {
      const response = await this.fetch<{ execution_uuid?: string }>(GENERATE_ROUTE, {
        method: 'POST',
        headers: {
          'elastic-api-version': INTERNAL_API_VERSION,
          'kbn-xsrf': 'true',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      executionUuid = response.execution_uuid ?? '';
    } catch (e) {
      return failure(`generate ${describeError(e)}`);
    }

    if (!executionUuid) {
      return failure('generate response missing execution_uuid');
    }

    const outcome = await this.pollUntilDone(executionUuid);

    return {
      discoveries: outcome.discoveries,
      executionUuid,
      status: outcome.status,
      workflowRuns: outcome.workflowRuns,
      startedAt,
      tokenUsageTrackingEnabled,
      latencyMs: Date.now() - t0,
      error: outcome.error,
    };
  }

  private async ensureWorkflowsSetting(): Promise<void> {
    if (this.workflowsSettingEnabled) return;

    const current = await this.fetch<{
      settings?: Record<string, { userValue?: unknown }>;
    }>(SETTINGS_ROUTE, { method: 'GET' });
    if (current?.settings?.[AD_WORKFLOWS_SETTING]?.userValue !== true) {
      await this.fetch(SETTINGS_ROUTE, {
        method: 'POST',
        headers: { 'kbn-xsrf': 'true', 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: { [AD_WORKFLOWS_SETTING]: true } }),
      });
    }
    this.workflowsSettingEnabled = true;
  }

  private async readSetting(key: string): Promise<unknown> {
    const current = await this.fetch<{
      settings?: Record<string, { userValue?: unknown }>;
    }>(SETTINGS_ROUTE, { method: 'GET' });
    return current?.settings?.[key]?.userValue;
  }

  /**
   * Never throws. The setting can be a read-only uiSettings override (a write returns 400), so a
   * failed write only means the caller must check the re-read value.
   */
  private async ensureTokenUsageTracking(): Promise<boolean> {
    try {
      if ((await this.readSetting(TOKEN_USAGE_TRACKING_SETTING)) !== true) {
        try {
          await this.fetch(SETTINGS_ROUTE, {
            method: 'POST',
            headers: { 'kbn-xsrf': 'true', 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes: { [TOKEN_USAGE_TRACKING_SETTING]: true } }),
          });
        } catch (e) {
          this.log.warning(
            `could not enable ${TOKEN_USAGE_TRACKING_SETTING} (${describeError(e)}); ` +
              'it may be a read-only override'
          );
        }
      }
      const enabled = (await this.readSetting(TOKEN_USAGE_TRACKING_SETTING)) === true;
      if (!enabled) {
        this.log.warning(`${TOKEN_USAGE_TRACKING_SETTING} is off; token usage will be unavailable`);
      }
      return enabled;
    } catch (e) {
      this.log.warning(`could not read ${TOKEN_USAGE_TRACKING_SETTING}: ${describeError(e)}`);
      return false;
    }
  }

  private async probeRunStatus(runId: string): Promise<string | undefined> {
    try {
      const run = await this.fetch<{ status?: string } | null>(
        `/api/workflows/executions/${encodeURIComponent(runId)}`,
        { method: 'GET', headers: { 'elastic-api-version': WORKFLOWS_API_VERSION } }
      );
      return run?.status;
    } catch (e) {
      if (PERMANENT_HTTP_STATUSES.has(statusOf(e) ?? 0)) throw e;
      // 404 (run not indexed yet) or a transient failure: not terminal yet.
      return undefined;
    }
  }

  private async fetchTracking(
    executionUuid: string
  ): Promise<{ tracking?: TrackingResponse; permanentError?: string }> {
    try {
      const tracking = await this.fetch<TrackingResponse>(
        `/internal/attack_discovery/executions/${encodeURIComponent(executionUuid)}/tracking`,
        { method: 'GET', headers: { 'elastic-api-version': INTERNAL_API_VERSION } }
      );
      return { tracking };
    } catch (e) {
      const status = statusOf(e);
      if (status !== undefined && PERMANENT_HTTP_STATUSES.has(status)) {
        return { permanentError: `tracking ${describeError(e)}` };
      }
      // 404 until the execution is in the event log; 429/5xx are transient.
      return {};
    }
  }

  private async pollUntilDone(executionUuid: string): Promise<{
    discoveries: AttackDiscovery[];
    status: string;
    workflowRuns: WorkflowRuns;
    error?: string;
  }> {
    const deadline = Date.now() + this.pollMaxWaitMs;
    const runStatuses = new Map<string, string>();
    let lastTracking: TrackingResponse | null = null;

    const fail = (status: string, error: string) => ({
      discoveries: [] as AttackDiscovery[],
      status,
      workflowRuns: toWorkflowRuns(lastTracking),
      error,
    });

    while (Date.now() < deadline) {
      const fetched = await this.fetchTracking(executionUuid);
      if (fetched.permanentError) return fail('failed', fetched.permanentError);

      if (fetched.tracking) {
        lastTracking = fetched.tracking;
        const workflowRuns = toWorkflowRuns(lastTracking);

        try {
          const pendingRunIds = allRunIds(workflowRuns).filter((runId) => {
            const known = runStatuses.get(runId) ?? '';
            return !RUN_SUCCESS_STATUSES.has(known) && !RUN_FAILURE_STATUSES.has(known);
          });
          for (const runId of pendingRunIds) {
            const status = await this.probeRunStatus(runId);
            if (status) runStatuses.set(runId, status);
          }
        } catch (e) {
          return fail('failed', `workflow run status ${describeError(e)}`);
        }

        const failedRun = allRunIds(workflowRuns).find((runId) =>
          RUN_FAILURE_STATUSES.has(runStatuses.get(runId) ?? '')
        );
        if (failedRun) {
          return fail('failed', `workflow run ${failedRun} ${runStatuses.get(failedRun)}`);
        }

        const { validation } = workflowRuns;
        if (validation && RUN_SUCCESS_STATUSES.has(runStatuses.get(validation) ?? '')) {
          return this.readDiscoveries(executionUuid, lastTracking, workflowRuns);
        }
      }

      await sleep(this.pollIntervalMs);
    }

    return fail('timed_out', `poll timed out after ${this.pollMaxWaitMs / 1000}s`);
  }

  private async readDiscoveries(
    executionUuid: string,
    tracking: TrackingResponse | null,
    workflowRuns: WorkflowRuns
  ): Promise<{
    discoveries: AttackDiscovery[];
    status: string;
    workflowRuns: WorkflowRuns;
    error?: string;
  }> {
    const generationWorkflowId = tracking?.generation?.workflow_id;
    if (!generationWorkflowId) {
      return {
        discoveries: [],
        status: 'failed',
        workflowRuns,
        error: 'validation completed but tracking has no generation workflow id',
      };
    }

    try {
      const pipeline = await this.fetch<{ validated_discoveries?: unknown }>(
        `/internal/attack_discovery/workflow/${encodeURIComponent(
          generationWorkflowId
        )}/execution/${encodeURIComponent(executionUuid)}`,
        { method: 'GET', headers: { 'elastic-api-version': INTERNAL_API_VERSION } }
      );
      return {
        discoveries: toDiscoveries(pipeline.validated_discoveries),
        status: 'succeeded',
        workflowRuns,
      };
    } catch (e) {
      this.log.warning(`pipeline data read failed for ${executionUuid}: ${messageOf(e)}`);
      return {
        discoveries: [],
        status: 'failed',
        workflowRuns,
        error: `pipeline data ${describeError(e)}`,
      };
    }
  }
}
