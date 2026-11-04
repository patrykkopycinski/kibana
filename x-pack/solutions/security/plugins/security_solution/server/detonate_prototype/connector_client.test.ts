/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { loggerMock } from '@kbn/logging-mocks';

import type { DetonateTask } from '../../common/detonate_prototype';
import { DetonateServiceError } from './client';
import { CONNECTOR_MAX_SAMPLE_BYTES, createConnectorDetonateClient } from './connector_client';

const TOKEN = 'enrollment-token-must-not-leak';
const CONNECTOR_ID = 'detonate-connector';
const SERVICE_BODY = 'internal detail from the service body';

const rawTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-11-01T10:00:00.000Z',
  tags: ['space:default'],
  sample_hash: 'a'.repeat(64),
  agent_version: '9.3.0',
  telemetry_cluster_version: '9.3.0',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  exec_wait_secs: 60,
  pre_exec_commands: [],
  exec_commands: [],
  vm_has_internet: false,
  agent_fleet_enrollment_token: TOKEN,
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...overrides,
});

const ok = (data: unknown) => ({ status: 'ok' as const, actionId: CONNECTOR_ID, data });
const failed = (message: string, serviceMessage?: string) => ({
  status: 'error' as const,
  actionId: CONNECTOR_ID,
  message,
  ...(serviceMessage ? { serviceMessage } : {}),
});

describe('createConnectorDetonateClient', () => {
  let execute: jest.Mock;
  let logger: ReturnType<typeof loggerMock.create>;

  const client = () =>
    createConnectorDetonateClient({
      getActionsClient: async () => ({ execute } as unknown as ActionsClient),
      connectorId: CONNECTOR_ID,
      requestTimeoutMs: 1_000,
      logger,
    });

  /** The params of the nth `execute` call. */
  const sent = (call = 0) => execute.mock.calls[call][0];

  const expectServiceError = async (promise: Promise<unknown>, statusCode: number) => {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DetonateServiceError);
    expect((error as DetonateServiceError).statusCode).toBe(statusCode);
    return error as DetonateServiceError;
  };

  beforeEach(() => {
    execute = jest.fn();
    logger = loggerMock.create();
  });

  describe('actions', () => {
    it('runs the configured connector with a raised response ceiling and a timeout', async () => {
      execute.mockResolvedValue(ok({ status: 'ok' }));

      expect(await client().healthcheck()).toEqual({ status: 'ok' });

      expect(sent()).toEqual({
        actionId: CONNECTOR_ID,
        params: {
          subAction: 'healthcheck',
          subActionParams: {},
          fetchOptions: { max_content_length: 20 * 1024 * 1024 },
        },
        signal: expect.any(AbortSignal),
      });
    });

    it('submits a hash with only the options the connector declares', async () => {
      execute.mockResolvedValue(ok(rawTask()));

      await client().submitHash({
        sample_hash: 'b'.repeat(64),
        tags: ['space:default'],
        exec_wait_secs: 120,
        vm_os_family: 'linux',
        vm_has_internet: undefined,
      });

      expect(sent().params.subAction).toBe('submitHash');
      expect(sent().params.subActionParams).toEqual({
        tags: ['space:default'],
        exec_wait_secs: 120,
        vm_os_family: 'linux',
        sample_hash: 'b'.repeat(64),
      });
    });

    it('submits a file as base64 with its filename', async () => {
      execute.mockResolvedValue(ok(rawTask()));

      await client().submitFile(
        { sample_filename: 'sample.exe', exec_commands: [] },
        { filename: 'sample.exe', body: Buffer.from('MZ') }
      );

      expect(sent().params.subAction).toBe('submitFile');
      expect(sent().params.subActionParams).toEqual({
        sample_filename: 'sample.exe',
        file: Buffer.from('MZ').toString('base64'),
        filename: 'sample.exe',
      });
    });

    it('reads a task by id', async () => {
      execute.mockResolvedValue(ok(rawTask({ id: 'task-9' })));

      expect((await client().getTask('task-9')).id).toBe('task-9');
      expect(sent().params).toMatchObject({
        subAction: 'getTask',
        subActionParams: { taskId: 'task-9' },
      });
    });

    it('unwraps task updates', async () => {
      execute.mockResolvedValue(
        ok({ updates: [{ task: rawTask(), timestamp: '2026-11-01T10:01:00.000Z' }] })
      );

      const updates = await client().getTaskUpdates('task-1');

      expect(updates).toHaveLength(1);
      expect(updates[0].timestamp).toBe('2026-11-01T10:01:00.000Z');
    });

    it.each([
      ['production-endpoint-alerts', 'production_endpoint'],
      ['diagnostic-endpoint-alerts', 'diagnostic_endpoint'],
      ['production-detection-alerts', 'production_detection'],
    ] as const)('maps %s to the connector source %s', async (kind, source) => {
      execute.mockResolvedValue(ok({ alerts: [{ _id: 'alert-1' }] }));

      expect(await client().getTaskAlerts('task-1', kind, 50)).toEqual([{ _id: 'alert-1' }]);
      expect(sent().params).toMatchObject({
        subAction: 'getTaskAlerts',
        subActionParams: { taskId: 'task-1', source, limit: 50 },
      });
    });

    it('leaves out an alert limit that was not given', async () => {
      execute.mockResolvedValue(ok({ alerts: [] }));

      await client().getTaskAlerts('task-1', 'production-endpoint-alerts');

      expect(sent().params.subActionParams).toEqual({
        taskId: 'task-1',
        source: 'production_endpoint',
      });
    });

    it('drops an empty query string from a task search', async () => {
      execute.mockResolvedValue(ok({ tasks: [rawTask()], offset: 0, size: 10 }));

      const page = await client().listTasks({ query_string: '', size: 10, order: 'desc' });

      expect(page.tasks).toHaveLength(1);
      expect(sent().params.subActionParams).toEqual({ size: 10, order: 'desc' });
    });

    it('looks a sample up by its lowercased sha256', async () => {
      execute.mockResolvedValue(ok({ tasks: [rawTask()] }));

      await client().findTasksByHash('C'.repeat(64), 5);

      expect(sent().params).toMatchObject({
        subAction: 'findTasksByHash',
        subActionParams: { sha256: 'c'.repeat(64), size: 5 },
      });
    });
  });

  describe('enrollment token redaction', () => {
    it('redacts every task-shaped answer', async () => {
      execute.mockResolvedValue(ok(rawTask()));
      expect(await client().getTask('task-1')).not.toHaveProperty('agent_fleet_enrollment_token');

      execute.mockResolvedValue(ok({ tasks: [rawTask()] }));
      const [found] = await client().findTasksByHash('a'.repeat(64));
      expect(found).not.toHaveProperty('agent_fleet_enrollment_token');
      const { tasks } = await client().listTasks();
      expect(tasks[0]).not.toHaveProperty('agent_fleet_enrollment_token');

      execute.mockResolvedValue(ok({ updates: [{ task: rawTask(), timestamp: 't' }] }));
      const [update] = await client().getTaskUpdates('task-1');
      expect(update.task).not.toHaveProperty('agent_fleet_enrollment_token');
    });
  });

  describe('options the connector cannot carry', () => {
    it.each([
      ['exec_commands', { exec_commands: ['whoami'] }],
      ['agent_dist_base_url', { agent_dist_base_url: 'https://example.invalid' }],
    ])('refuses %s instead of dropping it', async (key, options) => {
      const error = await expectServiceError(
        client().submitHash({ sample_hash: 'a'.repeat(64), ...options }),
        400
      );
      expect(error.message).toContain(key);
      expect(execute).not.toHaveBeenCalled();
    });

    it('refuses sample_ext on a file submission', async () => {
      await expectServiceError(
        client().submitFile({ sample_ext: 'dll' }, { filename: 's', body: Buffer.from('MZ') }),
        400
      );
      expect(execute).not.toHaveBeenCalled();
    });

    it.each([901, -1, 1.5])('refuses exec_wait_secs %s', async (execWaitSecs) => {
      await expectServiceError(
        client().submitHash({ sample_hash: 'a'.repeat(64), exec_wait_secs: execWaitSecs }),
        400
      );
      expect(execute).not.toHaveBeenCalled();
    });

    it('refuses a sample over the connector limit before calling it', async () => {
      await expectServiceError(
        client().submitFile(
          {},
          { filename: 'big.bin', body: Buffer.alloc(CONNECTOR_MAX_SAMPLE_BYTES + 1) }
        ),
        400
      );
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    it('keeps a privilege failure as a 403', async () => {
      execute.mockRejectedValue(Boom.forbidden(`Unauthorized to execute ${SERVICE_BODY}`));

      const error = await expectServiceError(client().getTask('task-1'), 403);

      expect(error.message).not.toContain(SERVICE_BODY);
    });

    it('turns any other throw into a 502, including a missing connector', async () => {
      execute.mockRejectedValue(Boom.notFound(`Saved object not found ${SERVICE_BODY}`));

      const error = await expectServiceError(client().getTask('task-1'), 502);

      expect(error.message).not.toContain(SERVICE_BODY);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(SERVICE_BODY));
    });

    it('turns a params validation failure into a 400', async () => {
      execute.mockResolvedValue(failed(`error validating action params: ${SERVICE_BODY}`));

      const error = await expectServiceError(client().getTask('task-1'), 400);

      expect(error.message).not.toContain(SERVICE_BODY);
    });

    it.each([
      [404, 404],
      [429, 429],
      [500, 502],
      [401, 502],
    ])('maps a service %s to %s', async (serviceStatus, expected) => {
      execute.mockResolvedValue(
        failed(`Detonate getTask failed (status ${serviceStatus}): ${SERVICE_BODY}`)
      );

      const error = await expectServiceError(client().getTask('task-1'), expected);

      expect(error.message).toBe(`The detonation service answered ${serviceStatus}.`);
    });

    it('turns a failure without a service status into a 502 and logs the detail', async () => {
      execute.mockResolvedValue(failed('an error occurred while running the action', SERVICE_BODY));

      const error = await expectServiceError(client().getTask('task-1'), 502);

      expect(error.message).not.toContain(SERVICE_BODY);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(SERVICE_BODY));
    });

    it('rejects an answer of the wrong shape', async () => {
      execute.mockResolvedValue(ok({ unexpected: true }));

      await expectServiceError(client().listTasks(), 502);
      await expectServiceError(client().healthcheck(), 502);
      await expectServiceError(client().getTaskAlerts('task-1', 'production-endpoint-alerts'), 502);
    });
  });
});
