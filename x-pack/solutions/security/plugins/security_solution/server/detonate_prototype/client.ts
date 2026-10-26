/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — HTTP client for the detonation service.
 *
 * STUB BOUNDARY: in this prototype the base URL points at a local simulator
 * that reproduces the real `/v1/detonate` contract byte-for-byte and either
 * replays recorded real detonations or drives a real VM. Pointing it at the
 * production service is a configuration change, not a code change — which is
 * the property this prototype is meant to demonstrate.
 *
 * The base URL always comes from configuration. No internal hostname appears
 * in this source, and the default is a localhost address that is useless to
 * anyone else.
 */

import type { Logger } from '@kbn/core/server';

import type {
  DetonateFileRequest,
  DetonateHashRequest,
  DetonateTask,
  DetonateTaskSearchResponse,
  DetonateTaskUpdate,
} from '../../common/detonate_prototype';

/** Service paths, relative to the configured base URL. */
const API_PREFIX = '/v1/detonate';

export interface DetonateClientOptions {
  /** Base URL of the detonation service, from configuration. */
  baseUrl: string;
  /** Per-request ceiling. A detonation is polled, so no single call is slow. */
  requestTimeoutMs: number;
  logger: Logger;
}

/**
 * Raised when the detonation service is unreachable or answers an error. The
 * `statusCode` is the service's, so routes can pass through a 404 for an
 * unknown task rather than flattening everything to a 500.
 */
export class DetonateServiceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'DetonateServiceError';
  }
}

export interface DetonateClient {
  healthcheck(): Promise<{ status: string }>;
  submitFile(
    request: DetonateFileRequest,
    file: { filename: string; body: Buffer }
  ): Promise<DetonateTask>;
  submitHash(request: DetonateHashRequest): Promise<DetonateTask>;
  getTask(taskId: string): Promise<DetonateTask>;
  getTaskUpdates(taskId: string): Promise<DetonateTaskUpdate[]>;
  listTasks(query?: {
    query_string?: string;
    alert_id?: string;
    offset?: number;
    size?: number;
  }): Promise<DetonateTaskSearchResponse>;
}

export const createDetonateClient = ({
  baseUrl,
  requestTimeoutMs,
  logger,
}: DetonateClientOptions): DetonateClient => {
  const url = (path: string) => `${baseUrl.replace(/\/$/, '')}${API_PREFIX}${path}`;

  /**
   * Every call is bounded by an AbortSignal. Without it an unreachable service
   * hangs the Kibana request until the client gives up, and the analyst sees a
   * spinner with no explanation.
   */
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const target = url(path);
    let response: Response;

    try {
      response = await fetch(target, {
        ...init,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `did not respond within ${requestTimeoutMs}ms`
          : `is unreachable (${error instanceof Error ? error.message : String(error)})`;
      // The URL is operator-supplied configuration, so it is safe to log for
      // diagnosis, but it never reaches the analyst-facing response body.
      logger.error(`Detonation service at ${target} ${reason}`);
      throw new DetonateServiceError(`The detonation service ${reason}.`, 502);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error(
        `Detonation service ${target} answered ${response.status}: ${body.slice(0, 500)}`
      );
      throw new DetonateServiceError(
        `The detonation service answered ${response.status}.`,
        // Pass through the ones a caller can act on; collapse the rest.
        response.status === 404 || response.status === 400 || response.status === 501
          ? response.status
          : 502
      );
    }

    return (await response.json()) as T;
  };

  return {
    healthcheck: () => call<{ status: string }>('/healthcheck'),

    submitFile: (request, file) => {
      // `POST /submit-file` is multipart: a `request_json` field plus the
      // sample itself. The field name is the service's, not a choice.
      const form = new FormData();
      form.set('request_json', JSON.stringify(request));
      form.set('sample_file', new Blob([new Uint8Array(file.body)]), file.filename);
      return call<DetonateTask>('/submit-file', { method: 'POST', body: form });
    },

    submitHash: (request) =>
      call<DetonateTask>('/submit-hash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),

    getTask: (taskId) => call<DetonateTask>(`/tasks/${encodeURIComponent(taskId)}`),

    getTaskUpdates: (taskId) =>
      call<DetonateTaskUpdate[]>(`/tasks/${encodeURIComponent(taskId)}/updates`),

    listTasks: (query = {}) => {
      const params = new URLSearchParams();
      if (query.query_string) params.set('query_string', query.query_string);
      if (query.alert_id) params.set('alert_id', query.alert_id);
      if (query.offset !== undefined) params.set('offset', String(query.offset));
      if (query.size !== undefined) params.set('size', String(query.size));
      const qs = params.toString();
      return call<DetonateTaskSearchResponse>(`/tasks${qs ? `?${qs}` : ''}`);
    },
  };
};
