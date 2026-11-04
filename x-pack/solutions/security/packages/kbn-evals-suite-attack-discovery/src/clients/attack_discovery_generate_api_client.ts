/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Client for the production Attack Discovery `_generate` API.
 *
 * Mirrors Chrysalis's `run_attack_discovery.py` flow:
 *   1. POST /api/attack_discovery/_generate → { execution_uuid }
 *   2. poll GET /api/attack_discovery/generations/{uuid} until terminal
 *   3. return discoveries + alerts_context_count + latency
 *
 * This exercises the FULL production AD pipeline (anonymization, alert
 * context assembly, AD-specific prompts) — unlike the direct-inference
 * mode in {@link runAttackDiscovery} which tests model reasoning in isolation.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { KbnClientRequesterError } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscovery } from '@kbn/elastic-assistant-common';
import {
  ATTACK_DISCOVERY_GENERATE,
  ATTACK_DISCOVERY_GENERATIONS_BY_ID,
  ELASTIC_AI_ASSISTANT_ANONYMIZATION_FIELDS_URL_FIND,
} from '@kbn/elastic-assistant-common';
import { isInfrastructureInferenceError } from '../task/infrastructure_error';
import type { AttackDiscoveryTaskErrorKind } from '../types';

const PUBLIC_API_VERSION = '2023-10-31';

const DEFAULT_ALERTS_INDEX = '.alerts-security.alerts-default';
const DEFAULT_SIZE = 100;
const DEFAULT_START = 'now-24h';
const DEFAULT_END = 'now';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled', 'dismissed']);
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_WAIT_MS = 1500_000;
const GENERATION_NOT_FOUND_GRACE_MS = 120_000;
// Consecutive failed polls needed before a deadline counts as infrastructure. Counted in polls,
// not seconds: each failed poll also spends the HTTP handler's own retries, so 24 of them span
// well over 120s. A single failed final poll after a long healthy run says nothing about an
// outage and the timeout stays the model's.
const MIN_POLL_FAILURE_STREAK = Math.ceil(GENERATION_NOT_FOUND_GRACE_MS / POLL_INTERVAL_MS);

export interface AnonymizationField {
  readonly id: string;
  readonly field: string;
  readonly allowed: boolean;
  readonly anonymized: boolean;
}

export interface GenerateApiOptions {
  readonly connectorId: string;
  readonly actionTypeId?: string;
  readonly modelId?: string;
  readonly alertsIndexPattern?: string;
  readonly size?: number;
  readonly start?: string;
  readonly end?: string;
}

export interface GenerateApiResult {
  readonly discoveries: AttackDiscovery[];
  readonly executionUuid: string;
  readonly status: string;
  readonly alertsContextCount?: number;
  readonly latencyMs: number;
  readonly error?: string;
  /** `infrastructure` when no model outcome was observed; the rule is in the package README. */
  readonly errorKind?: AttackDiscoveryTaskErrorKind;
}

export interface AttackDiscoveryGenerateApiClientConfig {
  readonly fetch: HttpHandler;
  readonly log: ToolingLog;
}

interface AnonymizationFieldsResponse {
  data?: Array<Record<string, unknown>>;
}

interface GenerateResponse {
  execution_uuid?: string;
}

interface GenerationPollResponse {
  generation?: {
    status?: string;
    reason?: string;
    alerts_context_count?: number;
  };
  data?: AttackDiscovery[];
}

const extractStatusFromError = (e: unknown): number | undefined => {
  const err = e as Partial<KbnClientRequesterError>;
  return typeof err?.status === 'number' ? err.status : undefined;
};

// Same rule as `chatComplete` and the alert search: a deterministic rejection (for example a 400
// for a bad `alertsIndexPattern` or filter) stays unmarked and scores as a model failure.
const infrastructureKind = (e: unknown): { errorKind?: 'infrastructure' } =>
  isInfrastructureInferenceError(e) ? { errorKind: 'infrastructure' } : {};

const extractBodyTextFromError = (e: unknown): string => {
  if (e instanceof Error) return e.message.slice(0, 800);
  return String(e).slice(0, 800);
};

export class AttackDiscoveryGenerateApiClient {
  constructor(private readonly fetch: HttpHandler, private readonly log: ToolingLog) {}

  // Rejects on failure: an empty list would make Kibana fail the run with `NO_FIELDS_ALLOWED`.
  async fetchAnonymizationFields(): Promise<AnonymizationField[]> {
    try {
      const query = { page: '1', per_page: '1000' };
      const payload = await this.fetch<AnonymizationFieldsResponse>(
        `${ELASTIC_AI_ASSISTANT_ANONYMIZATION_FIELDS_URL_FIND}`,
        {
          method: 'GET',
          version: PUBLIC_API_VERSION,
          query,
        }
      );

      return (payload.data ?? []).map((f) => ({
        id: String(f.id ?? ''),
        field: String(f.field ?? ''),
        allowed: f.allowed !== false,
        anonymized: f.anonymized === true,
      }));
    } catch (e) {
      this.log.warning(`anonymization_fields find failed (${extractStatusFromError(e) ?? 'n/a'})`);
      throw e;
    }
  }

  async generate(opts: GenerateApiOptions): Promise<GenerateApiResult> {
    const t0 = Date.now();

    let anonymizationFields: AnonymizationField[];
    try {
      anonymizationFields = await this.fetchAnonymizationFields();
    } catch (e) {
      return {
        discoveries: [],
        executionUuid: '',
        status: 'failed',
        latencyMs: Date.now() - t0,
        ...infrastructureKind(e),
        error: `anonymization_fields HTTP ${
          extractStatusFromError(e) ?? 'n/a'
        }: ${extractBodyTextFromError(e)}`,
      };
    }

    const body: Record<string, unknown> = {
      alertsIndexPattern: opts.alertsIndexPattern ?? DEFAULT_ALERTS_INDEX,
      anonymizationFields,
      apiConfig: {
        connectorId: opts.connectorId,
        actionTypeId: opts.actionTypeId ?? '.inference',
        ...(opts.modelId ? { model: opts.modelId } : {}),
      },
      size: opts.size ?? DEFAULT_SIZE,
      start: opts.start ?? DEFAULT_START,
      end: opts.end ?? DEFAULT_END,
      replacements: {},
      subAction: 'invokeAI',
    };

    let executionUuid: string;

    try {
      const generatePayload = await this.fetch<GenerateResponse>(ATTACK_DISCOVERY_GENERATE, {
        method: 'POST',
        version: PUBLIC_API_VERSION,
        body: JSON.stringify(body),
        headers: { 'kbn-xsrf': 'true', 'Content-Type': 'application/json' },
      });

      executionUuid = generatePayload.execution_uuid ?? '';
    } catch (e) {
      return {
        discoveries: [],
        executionUuid: '',
        status: 'failed',
        latencyMs: Date.now() - t0,
        ...infrastructureKind(e),
        error: `generate HTTP ${extractStatusFromError(e) ?? 'n/a'}: ${extractBodyTextFromError(
          e
        )}`,
      };
    }

    if (!executionUuid) {
      return {
        discoveries: [],
        executionUuid: '',
        status: 'failed',
        latencyMs: Date.now() - t0,
        errorKind: 'infrastructure',
        error: 'generate response missing execution_uuid',
      };
    }

    const { discoveries, status, alertsContextCount, error, errorKind } = await this.pollUntilDone(
      executionUuid
    );

    return {
      discoveries,
      executionUuid,
      status,
      alertsContextCount,
      latencyMs: Date.now() - t0,
      error,
      errorKind,
    };
  }

  private async pollUntilDone(executionUuid: string): Promise<{
    discoveries: AttackDiscovery[];
    status: string;
    alertsContextCount?: number;
    error?: string;
    errorKind?: AttackDiscoveryTaskErrorKind;
  }> {
    const endpoint = ATTACK_DISCOVERY_GENERATIONS_BY_ID.replace(
      '{execution_uuid}',
      encodeURIComponent(executionUuid)
    );
    const query = {
      enable_field_rendering: 'false',
      with_replacements: 'true',
    };

    const deadline = Date.now() + POLL_MAX_WAIT_MS;
    const notFoundGraceDeadline = Date.now() + GENERATION_NOT_FOUND_GRACE_MS;
    // The latest retried poll failure and the length of the current run of such failures; a poll
    // that returns a payload resets both.
    let lastPollError: { status: number | undefined; message: string } | undefined;
    let pollFailureStreak = 0;

    while (Date.now() < deadline) {
      let status: number | undefined;
      let payload: GenerationPollResponse | undefined;
      let pollFailed = false;

      try {
        payload = await this.fetch<GenerationPollResponse>(endpoint, {
          method: 'GET',
          version: PUBLIC_API_VERSION,
          query,
        });
      } catch (e) {
        status = extractStatusFromError(e);
        const shouldRetry = status === 429 || (status !== undefined && status >= 500);
        const isNotFoundGrace = status === 404 && Date.now() < notFoundGraceDeadline;

        if (shouldRetry || isNotFoundGrace) {
          pollFailed = true;
          pollFailureStreak += 1;
          lastPollError = { status, message: extractBodyTextFromError(e).slice(0, 400) };
        } else if (status === 404) {
          return {
            discoveries: [],
            status: 'failed',
            errorKind: 'infrastructure',
            error: `poll HTTP 404 (generation never materialized): ${extractBodyTextFromError(
              e
            ).slice(0, 400)}`,
          };
        } else {
          return {
            discoveries: [],
            status: 'failed',
            ...infrastructureKind(e),
            error: `poll HTTP ${status ?? 'n/a'}: ${extractBodyTextFromError(e)}`,
          };
        }
      }

      if (!pollFailed) {
        lastPollError = undefined;
        pollFailureStreak = 0;
        const generation = payload?.generation ?? {};
        const genStatus = String(generation.status ?? '');

        if (TERMINAL_STATUSES.has(genStatus)) {
          const data = payload?.data ?? [];

          if (genStatus !== 'succeeded') {
            return {
              discoveries: [],
              status: genStatus,
              // `failed` is the generation's own verdict; `canceled`/`dismissed` mean something
              // outside the model stopped it.
              ...(genStatus === 'failed' ? {} : { errorKind: 'infrastructure' as const }),
              error: `generation ${genStatus}: ${String(generation.reason ?? genStatus)}`,
            };
          }

          return {
            discoveries: data,
            status: genStatus,
            alertsContextCount: generation.alerts_context_count,
          };
        }
      }

      await sleep(POLL_INTERVAL_MS);
    }

    if (lastPollError && pollFailureStreak >= MIN_POLL_FAILURE_STREAK) {
      return {
        discoveries: [],
        status: 'timed_out',
        errorKind: 'infrastructure',
        error: `poll HTTP ${lastPollError.status ?? 'n/a'} until deadline (${
          POLL_MAX_WAIT_MS / 1000
        }s): ${lastPollError.message}`,
      };
    }

    return {
      discoveries: [],
      status: 'timed_out',
      error: `poll timed out after ${POLL_MAX_WAIT_MS / 1000}s`,
    };
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
