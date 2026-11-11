/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — the same client, backed by a `.detonate` connector.
 *
 * With a connector the service address and its API key live in the connector
 * (the key as an encrypted secret) instead of `kibana.yml`, and every call runs
 * as the requesting user, so it needs that user's Actions `execute` privilege
 * on top of the Detonate privilege the routes and tools already check.
 */

import Boom from '@hapi/boom';
import type { Logger } from '@kbn/core/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';

import type {
  DetonateAlertDoc,
  DetonateAlertKind,
  DetonateBaseRequest,
  DetonateFileRequest,
  DetonateTask,
  DetonateTaskSearchResponse,
  DetonateTaskUpdate,
} from '../../common/detonate_prototype';
import { redactDetonateTask } from '../../common/detonate_prototype';
import type { DetonateClient, DetonateTaskSearchQuery } from './client';
import { DetonateServiceError, toDetonateStatusCode } from './client';

/** The connector's own submit limits; it refuses anything larger as invalid params. */
export const CONNECTOR_MAX_SAMPLE_BYTES = 10 * 1024 * 1024;
export const CONNECTOR_MAX_EXEC_WAIT_SECS = 900;

/**
 * The actions framework caps a connector response at 1 MiB by default, and a
 * page of alert documents or task snapshots is routinely larger than that.
 */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

const ALERT_SOURCE_BY_KIND: Record<DetonateAlertKind, string> = {
  'production-endpoint-alerts': 'production_endpoint',
  'diagnostic-endpoint-alerts': 'diagnostic_endpoint',
  'production-detection-alerts': 'production_detection',
};

/** The events read's source name, in the connector's snake_case convention. */
const PROCESS_EVENTS_SOURCE = 'process_events';

/** Run options the connector's submit actions declare. Its params schema rejects any other key. */
const RUN_OPTION_KEYS = [
  'tags',
  'exec_wait_secs',
  'pre_exec_commands',
  'exec_sample_arguments',
  'sample_filename',
  'vm_os_family',
  'vm_disk_image',
  'vm_has_internet',
  'agent_version',
] as const;

/** Accepted by the direct client but not by the connector's sample submits. */
const UNSUPPORTED_KEYS = ['exec_commands', 'agent_dist_base_url', 'sample_ext'] as const;

/** The connector leads every handler error with the service's status in this shape. */
const SERVICE_STATUS_PATTERN = /\(status (\d{3})\)/;

const PARAMS_VALIDATION_PREFIX = 'error validating action params';

export interface ConnectorDetonateClientOptions {
  /** Resolves an actions client scoped to the requesting user. */
  getActionsClient: () => Promise<ActionsClient>;
  connectorId: string;
  requestTimeoutMs: number;
  logger: Logger;
}

const invalidRequest = (message: string) => new DetonateServiceError(message, 400);

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);

/**
 * Silently dropping an option would run a different detonation from the one
 * the analyst asked for, so options the connector cannot carry are refused.
 */
const toRunOptions = (
  request: DetonateBaseRequest & { sample_filename?: string; sample_ext?: string }
): Record<string, unknown> => {
  const unsupported = UNSUPPORTED_KEYS.filter((key) => hasValue(request[key]));
  if (unsupported.length > 0) {
    throw invalidRequest(
      `The Detonate connector does not accept ${unsupported.join(', ')} on a sample submission.`
    );
  }

  const { exec_wait_secs: execWaitSecs } = request;
  if (
    execWaitSecs !== undefined &&
    (!Number.isInteger(execWaitSecs) ||
      execWaitSecs < 0 ||
      execWaitSecs > CONNECTOR_MAX_EXEC_WAIT_SECS)
  ) {
    throw invalidRequest(
      `exec_wait_secs must be a whole number of seconds from 0 to ${CONNECTOR_MAX_EXEC_WAIT_SECS}.`
    );
  }

  return Object.fromEntries(
    RUN_OPTION_KEYS.filter((key) => request[key as keyof typeof request] !== undefined).map(
      (key) => [key, request[key as keyof typeof request]]
    )
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createConnectorDetonateClient = ({
  getActionsClient,
  connectorId,
  requestTimeoutMs,
  logger,
}: ConnectorDetonateClientOptions): DetonateClient => {
  /**
   * The connector's message can carry the service's response body, so it is
   * logged here and never forwarded: the routes pass a `DetonateServiceError`
   * message through to the browser verbatim.
   */
  const execute = async (
    subAction: string,
    subActionParams: Record<string, unknown>
  ): Promise<unknown> => {
    let result;
    try {
      const actionsClient = await getActionsClient();
      result = await actionsClient.execute({
        actionId: connectorId,
        params: {
          subAction,
          subActionParams,
          fetchOptions: { max_content_length: MAX_RESPONSE_BYTES },
        },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error) {
      logger.error(
        `Detonate connector ${connectorId} ${subAction} threw: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Only a privilege failure keeps its status. A missing connector is a
      // saved-object 404, which callers would misread as an unknown task.
      if (Boom.isBoom(error) && error.output.statusCode === 403) {
        throw new DetonateServiceError(
          'You are not allowed to run the configured Detonate connector.',
          403
        );
      }
      throw new DetonateServiceError('The Detonate connector could not be run.', 502);
    }

    if (result.status === 'ok') {
      return result.data;
    }

    const message = result.message ?? '';
    logger.error(
      `Detonate connector ${connectorId} ${subAction} failed: ${message}${
        result.serviceMessage ? ` (${result.serviceMessage})` : ''
      }`
    );
    if (message.startsWith(PARAMS_VALIDATION_PREFIX)) {
      throw invalidRequest('The Detonate connector rejected the request options.');
    }
    const status = SERVICE_STATUS_PATTERN.exec(message)?.[1];
    if (status) {
      throw new DetonateServiceError(
        `The detonation service answered ${status}.`,
        toDetonateStatusCode(Number(status))
      );
    }
    throw new DetonateServiceError('The Detonate connector could not reach the service.', 502);
  };

  const unexpected = (subAction: string): never => {
    logger.error(`Detonate connector ${connectorId} ${subAction} returned an unexpected shape`);
    throw new DetonateServiceError('The detonation service answered unexpectedly.', 502);
  };

  const readTask = async (subAction: string, params: Record<string, unknown>) => {
    const data = await execute(subAction, params);
    return isRecord(data)
      ? redactDetonateTask(data as unknown as DetonateTask)
      : unexpected(subAction);
  };

  const listTasks = async (query: DetonateTaskSearchQuery = {}) => {
    const data = await execute('listTasks', {
      ...(query.query_string ? { query_string: query.query_string } : {}),
      ...(query.offset !== undefined ? { offset: query.offset } : {}),
      ...(query.size !== undefined ? { size: query.size } : {}),
      ...(query.order ? { order: query.order } : {}),
    });
    if (!isRecord(data) || !Array.isArray(data.tasks)) return unexpected('listTasks');
    const page = data as unknown as DetonateTaskSearchResponse;
    return { ...page, tasks: page.tasks.map(redactDetonateTask) };
  };

  return {
    healthcheck: async () => {
      const data = await execute('healthcheck', {});
      return isRecord(data) && typeof data.status === 'string'
        ? { status: data.status }
        : unexpected('healthcheck');
    },

    submitFile: async (request: DetonateFileRequest, file) => {
      if (file.body.length > CONNECTOR_MAX_SAMPLE_BYTES) {
        throw invalidRequest(
          `Samples over ${
            CONNECTOR_MAX_SAMPLE_BYTES / 1024 / 1024
          } MiB cannot be submitted through the Detonate connector.`
        );
      }
      return readTask('submitFile', {
        ...toRunOptions(request),
        file: file.body.toString('base64'),
        filename: file.filename,
      });
    },

    submitHash: async ({ sample_hash: sampleHash, ...options }) =>
      readTask('submitHash', { ...toRunOptions(options), sample_hash: sampleHash }),

    getTask: (taskId) => readTask('getTask', { taskId }),

    getTaskUpdates: async (taskId) => {
      const data = await execute('getTaskUpdates', { taskId });
      if (!isRecord(data) || !Array.isArray(data.updates)) return unexpected('getTaskUpdates');
      return (data.updates as DetonateTaskUpdate[]).map((update) => ({
        ...update,
        task: redactDetonateTask(update.task),
      }));
    },

    getTaskAlerts: async (taskId, kind, limit) => {
      const data = await execute('getTaskAlerts', {
        taskId,
        source: ALERT_SOURCE_BY_KIND[kind],
        ...(limit !== undefined ? { limit } : {}),
      });
      if (!isRecord(data) || !Array.isArray(data.alerts)) return unexpected('getTaskAlerts');
      return data.alerts as DetonateAlertDoc[];
    },

    getTaskProcessEvents: async (taskId, limit) => {
      const data = await execute('getTaskAlerts', {
        taskId,
        source: PROCESS_EVENTS_SOURCE,
        ...(limit !== undefined ? { limit } : {}),
      });
      if (!isRecord(data) || !Array.isArray(data.alerts)) return unexpected('getTaskAlerts');
      return data.alerts as DetonateAlertDoc[];
    },

    listTasks,

    findTasksByHash: async (sha256, size = 10) => {
      const data = await execute('findTasksByHash', { sha256: sha256.toLowerCase(), size });
      if (!isRecord(data) || !Array.isArray(data.tasks)) return unexpected('findTasksByHash');
      return (data.tasks as DetonateTask[]).map(redactDetonateTask);
    },
  };
};
