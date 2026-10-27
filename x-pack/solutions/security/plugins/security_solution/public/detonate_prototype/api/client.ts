/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — browser-side API client.
 *
 * Wraps the Kibana proxy routes, not the detonation service. The browser never
 * learns the service's address: that is operator configuration read on the
 * server, and keeping it there is the reason these routes exist at all.
 *
 * Both analyst surfaces that run in the browser (the Detonate page and the
 * alert action) go through this module, so the API version header and the
 * request shapes are written once.
 */

import type { HttpSetup } from '@kbn/core/public';

import {
  DETONATE_HEALTHCHECK_PATH,
  DETONATE_SUBMIT_FILE_PATH,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
} from '../../../common/detonate_prototype';
import type {
  DetonateHashRequest,
  DetonateTask,
  DetonateTaskSearchResponse,
  DetonateTaskUpdate,
} from '../../../common/detonate_prototype';

/** Every prototype route is registered at version 1. */
const VERSION = { version: '1' } as const;

/** A submit answer: the task, plus whether it is an existing report. */
export interface DetonateSubmitResult extends DetonateTask {
  deduplicated?: boolean;
}

export interface SubmitFileParams {
  file: File;
  /** Same optional fields the hash path sends; omitted ones use service defaults. */
  tags?: string[];
  vm_os_family?: string;
  vm_architecture?: string;
}

export const detonateApi = {
  healthcheck: (http: HttpSetup, signal?: AbortSignal) =>
    http.get<{ status: string }>(DETONATE_HEALTHCHECK_PATH, { version: VERSION.version, signal }),

  submitHash: (http: HttpSetup, request: DetonateHashRequest, signal?: AbortSignal) =>
    http.post<DetonateSubmitResult>(DETONATE_SUBMIT_HASH_PATH, {
      version: VERSION.version,
      body: JSON.stringify(request),
      signal,
    }),

  /**
   * Multipart, to match the service's `POST /submit-file`. The options ride in
   * a `request_json` form field rather than as separate parts, which is what
   * the real service expects — flattening them into form fields would work
   * against the proxy and fail against the service.
   */
  submitFile: (
    http: HttpSetup,
    { file, ...requestOptions }: SubmitFileParams,
    signal?: AbortSignal
  ) => {
    const body = new FormData();
    body.append('sample_file', file);
    body.append('sample_filename', file.name);
    // Same optional fields the hash path sends as its JSON body, serialized
    // into the multipart `request_json` part — one contract for both submit
    // modes.
    if (Object.keys(requestOptions).length > 0) {
      body.append('request_json', JSON.stringify(requestOptions));
    }

    return http.post<DetonateSubmitResult>(DETONATE_SUBMIT_FILE_PATH, {
      version: VERSION.version,
      body,
      // Let the browser set the multipart boundary; a hand-set Content-Type
      // omits it and the server cannot parse the request.
      headers: { 'Content-Type': undefined },
      signal,
    });
  },

  getTask: (http: HttpSetup, taskId: string, signal?: AbortSignal) =>
    http.get<DetonateTask>(`${DETONATE_TASKS_PATH}/${encodeURIComponent(taskId)}`, {
      version: VERSION.version,
      signal,
    }),

  getTaskUpdates: (http: HttpSetup, taskId: string, signal?: AbortSignal) =>
    http.get<DetonateTaskUpdate[]>(`${DETONATE_TASKS_PATH}/${encodeURIComponent(taskId)}/updates`, {
      version: VERSION.version,
      signal,
    }),

  listTasks: (
    http: HttpSetup,
    query: { query_string?: string; alert_id?: string; offset?: number; size?: number },
    signal?: AbortSignal
  ) =>
    http.get<DetonateTaskSearchResponse>(DETONATE_TASKS_PATH, {
      version: VERSION.version,
      query,
      signal,
    }),

  /** Runs→alerts reverse index: every run started from one alert. */
  listTasksForAlert: (http: HttpSetup, alertId: string, signal?: AbortSignal) =>
    http.get<DetonateTaskSearchResponse>(
      `${DETONATE_TASKS_PATH}/alert/${encodeURIComponent(alertId)}`,
      { version: VERSION.version, signal }
    ),
};
