/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Readable } from 'stream';

import { httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { RouterMock } from '@kbn/core-http-router-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';

import {
  DETONATE_SUBMIT_FILE_PATH,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_PRIOR_RUNS_PATH,
  DETONATE_RUNS_PATH,
  DETONATE_TASKS_PATH,
} from '../../../common/detonate_prototype';
import type { DetonateClient, DetonateServiceError } from '../client';
import { registerDetonatePrototypeRoutes } from '.';

const RECORD_PATH = `${DETONATE_RUNS_PATH}/{id}/record`;

describe('registerDetonatePrototypeRoutes', () => {
  let router: RouterMock;
  let mockResponse: ReturnType<typeof httpServerMock.createResponseFactory>;
  let client: jest.Mocked<DetonateClient>;
  let endpointAppContextService: {
    getActiveSpaceId: jest.Mock;
  };
  let hasDetonatePrivilege: jest.Mock;

  const createRequest = (method: 'post' | 'get', path: string, body?: unknown, params?: unknown) =>
    httpServerMock.createKibanaRequest({
      method,
      path,
      body: body as Record<string, unknown>,
      ...(params ? { params: params as Record<string, unknown> } : {}),
    });

  const submitHashHandler = () =>
    router.versioned.getRoute('post', DETONATE_SUBMIT_HASH_PATH).versions['1'].handler;

  const submitFileHandler = () =>
    router.versioned.getRoute('post', DETONATE_SUBMIT_FILE_PATH).versions['1'].handler;

  const getTaskHandler = () =>
    router.versioned.getRoute('get', `${DETONATE_TASKS_PATH}/{taskId}`).versions['1'].handler;

  const taskUpdatesHandler = () =>
    router.versioned.getRoute('get', `${DETONATE_TASKS_PATH}/{taskId}/updates`).versions['1']
      .handler;

  const taskAlertsHandler = () =>
    router.versioned.getRoute('get', `${DETONATE_TASKS_PATH}/{taskId}/alerts`).versions['1']
      .handler;

  const listTasksHandler = () =>
    router.versioned.getRoute('get', DETONATE_TASKS_PATH).versions['1'].handler;

  const alertTasksHandler = () =>
    router.versioned.getRoute('get', `${DETONATE_TASKS_PATH}/alert/{alertId}`).versions['1']
      .handler;

  const recordHandler = () => router.versioned.getRoute('get', RECORD_PATH).versions['1'].handler;

  const priorRunsHandler = () =>
    router.versioned.getRoute('get', `${DETONATE_PRIOR_RUNS_PATH}/{sha256}`).versions['1'].handler;

  /**
   * The submit-hash body validator is a config-schema object (not a route
   * validation function), so out-of-bounds payloads are exercised by running
   * the registered schema the way the HTTP router does — `validate` throws on
   * invalid input, which the router turns into a 400.
   */
  const submitHashBodySchema = () => {
    const { config } = router.versioned.getRoute('post', DETONATE_SUBMIT_HASH_PATH).versions['1'];
    const validation = typeof config.validate === 'function' ? config.validate() : config.validate;
    if (!validation || !validation.request) {
      throw new Error('submit-hash route registered without request validation');
    }
    return validation.request.body as { validate(body: unknown): unknown };
  };

  const createContext = () => ({} as never);

  const register = ({ canWrite }: { canWrite: boolean }) => {
    router = httpServiceMock.createRouter() as unknown as RouterMock;
    mockResponse = httpServerMock.createResponseFactory();
    endpointAppContextService = {
      getActiveSpaceId: jest.fn().mockReturnValue('default'),
    };
    hasDetonatePrivilege = jest.fn().mockResolvedValue(canWrite);
    registerDetonatePrototypeRoutes({
      router: router as never,
      logger: loggerMock.create(),
      getClient: () => client,
      endpointAppContextService: endpointAppContextService as never,
      hasDetonatePrivilege,
    });
  };

  beforeEach(() => {
    client = {
      healthcheck: jest.fn(),
      submitFile: jest.fn(),
      submitHash: jest.fn(),
      getTask: jest.fn(),
      getTaskUpdates: jest.fn(),
      getTaskAlerts: jest.fn(),
      listTasks: jest.fn(),
      findTasksByHash: jest.fn(),
    };
    register({ canWrite: true });
  });

  describe('write-privilege gate', () => {
    const forbiddenBody = {
      body: {
        message:
          'Submitting a sample for detonation requires the Security Solution write privilege or the Detonate privilege.',
      },
    };

    it('rejects a read-only analyst on the hash submit route', async () => {
      register({ canWrite: false });
      client.submitHash.mockResolvedValue({ id: 'task-1' } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.forbidden).toHaveBeenCalledWith(forbiddenBody);
      expect(client.submitHash).not.toHaveBeenCalled();
    });

    it('asks for write access, not read, before submitting', async () => {
      client.submitHash.mockResolvedValue({ id: 'task-1' } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(hasDetonatePrivilege).toHaveBeenCalledWith(expect.anything(), 'write');
    });

    it('opens every route to either Security Solution access or the Detonate privilege', () => {
      const routeConfigs = [
        ...router.versioned.get.mock.calls.map(([config]) => config),
        ...router.versioned.post.mock.calls.map(([config]) => config),
      ];
      const securityConfigs = routeConfigs
        .filter(({ path }) => path !== RECORD_PATH)
        .map(({ security }) => security);

      expect(securityConfigs.length).toBe(routeConfigs.length - 1);
      for (const security of securityConfigs) {
        expect(security).toEqual({
          authz: {
            requiredPrivileges: [
              { anyRequired: ['securitySolution', 'securitySolution-detonateAll'] },
            ],
          },
        });
      }
    });

    it('rejects a read-only analyst on the file submit route', async () => {
      register({ canWrite: false });
      client.submitFile.mockResolvedValue({ id: 'task-2' } as never);

      const fileRequest = httpServerMock.createKibanaRequest({
        method: 'post',
        path: DETONATE_SUBMIT_FILE_PATH,
        body: {
          sample_file: Readable.from([Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR')]),
          sample_filename: 'sample.txt',
        },
      }) as never;

      await submitFileHandler()(createContext(), fileRequest, mockResponse);

      expect(mockResponse.forbidden).toHaveBeenCalledWith(forbiddenBody);
      expect(client.submitFile).not.toHaveBeenCalled();
    });
  });

  describe('submit-hash validation', () => {
    it.each([
      ['sample_hash shorter than 32 characters', { sample_hash: 'a'.repeat(31) }],
      ['sample_hash longer than 128 characters', { sample_hash: 'a'.repeat(129) }],
      [
        'more than 32 tags',
        {
          sample_hash: 'a'.repeat(64),
          tags: Array.from({ length: 33 }, (_, i) => `tag-${i}`),
        },
      ],
    ])('rejects %s', (_name, body) => {
      expect(() => submitHashBodySchema().validate(body)).toThrow();
    });

    it('accepts a well-formed hash submission', () => {
      expect(
        submitHashBodySchema().validate({ sample_hash: 'a'.repeat(64), tags: ['demo'] })
      ).toEqual({ sample_hash: 'a'.repeat(64), tags: ['demo'] });
    });
  });

  describe('submit-hash handler', () => {
    it('returns the created task from the service', async () => {
      const task = { id: 'task-1' };
      client.submitHash.mockResolvedValue(task as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(client.submitHash).toHaveBeenCalledWith({
        sample_hash: 'a'.repeat(64),
        tags: ['space:default'],
      });
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: task });
    });

    it('passes a service quota rejection (429) through to the analyst', async () => {
      const { DetonateServiceError: Ctor } = jest.requireActual<{
        DetonateServiceError: typeof DetonateServiceError;
      }>('../client');
      client.submitHash.mockRejectedValue(new Ctor('The detonation service answered 429.', 429));

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 429 })
      );
    });

    it('shapes a service error as a custom error with the service status', async () => {
      const { DetonateServiceError: Ctor } = jest.requireActual<{
        DetonateServiceError: typeof DetonateServiceError;
      }>('../client');
      client.submitHash.mockRejectedValue(new Ctor('The detonation service answered 400.', 400));

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('submit-file handler', () => {
    const sampleStream = (content: string) => Readable.from([Buffer.from(content)]);

    const createFileRequest = (requestJson: string | undefined) =>
      httpServerMock.createKibanaRequest({
        method: 'post',
        path: DETONATE_SUBMIT_FILE_PATH,
        body: {
          sample_file: sampleStream('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'),
          sample_filename: 'sample.txt',
          ...(requestJson === undefined ? {} : { request_json: requestJson }),
        },
      }) as never;

    it('returns 400 when request_json is not valid JSON', async () => {
      await submitFileHandler()(createContext(), createFileRequest('{not json'), mockResponse);

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: '`request_json` is not valid JSON.' },
      });
      expect(client.submitFile).not.toHaveBeenCalled();
    });

    it('returns 400 when request_json parses but contains invalid options', async () => {
      await submitFileHandler()(
        createContext(),
        createFileRequest('{"exec_wait_secs": 9999}'),
        mockResponse
      );

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: '`request_json` contains invalid options.' },
      });
      expect(client.submitFile).not.toHaveBeenCalled();
    });

    it('rejects an empty sample with 400', async () => {
      const emptyRequest = httpServerMock.createKibanaRequest({
        method: 'post',
        path: DETONATE_SUBMIT_FILE_PATH,
        body: {
          sample_file: sampleStream(''),
          sample_filename: 'sample.txt',
        },
      }) as never;

      await submitFileHandler()(createContext(), emptyRequest, mockResponse);

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: 'The sample file is empty.' },
      });
      expect(client.submitFile).not.toHaveBeenCalled();
    });

    it('submits valid options parsed from request_json', async () => {
      const task = { id: 'task-2' };
      client.submitFile.mockResolvedValue(task as never);

      await submitFileHandler()(
        createContext(),
        createFileRequest('{"tags":["demo"]}'),
        mockResponse
      );

      expect(client.submitFile).toHaveBeenCalledWith(
        { tags: ['demo', 'space:default'], sample_filename: 'sample.txt' },
        expect.objectContaining({ filename: 'sample.txt' })
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: task });
    });
  });

  describe('space scoping', () => {
    const { DetonateServiceError: Ctor } = jest.requireActual<{
      DetonateServiceError: typeof DetonateServiceError;
    }>('../client');

    beforeEach(() => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
    });

    it('tags a submit with the active space and drops a caller-supplied space tag', async () => {
      client.submitHash.mockResolvedValue({ id: 'task-1', tags: ['space:team-a'] } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
          sample_hash: 'a'.repeat(64),
          tags: ['demo', 'space:team-b'],
        }),
        mockResponse
      );

      expect(client.submitHash).toHaveBeenCalledTimes(1);
      expect(client.submitHash).toHaveBeenCalledWith({
        sample_hash: 'a'.repeat(64),
        tags: ['demo', 'space:team-a'],
      });
    });

    it('answers 404 for a run from another space', async () => {
      client.getTask.mockResolvedValue({ id: 'task-foreign', tags: ['space:team-b'] } as never);

      await getTaskHandler()(
        createContext(),
        createRequest('get', `${DETONATE_TASKS_PATH}/task-foreign`, undefined, {
          taskId: 'task-foreign',
        }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('answers 404 for the timeline of an untagged run without reading it', async () => {
      client.getTask.mockResolvedValue({ id: 'task-legacy', tags: [] } as never);

      await taskUpdatesHandler()(
        createContext(),
        createRequest('get', `${DETONATE_TASKS_PATH}/task-legacy/updates`, undefined, {
          taskId: 'task-legacy',
        }),
        mockResponse
      );

      expect(client.getTaskUpdates).not.toHaveBeenCalled();
      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('returns a run from the active space', async () => {
      const task = { id: 'task-1', tags: ['space:team-a'] };
      client.getTask.mockResolvedValue(task as never);

      await getTaskHandler()(
        createContext(),
        createRequest('get', `${DETONATE_TASKS_PATH}/task-1`, undefined, { taskId: 'task-1' }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({ body: task });
    });

    const alertsRequest = (taskId: string, query: Record<string, unknown>) =>
      httpServerMock.createKibanaRequest({
        method: 'get',
        path: `${DETONATE_TASKS_PATH}/${taskId}/alerts`,
        params: { taskId },
        query,
      });

    it("answers 404 for another space's alert documents without reading them", async () => {
      client.getTask.mockResolvedValue({ id: 'task-foreign', tags: ['space:team-b'] } as never);

      await taskAlertsHandler()(
        createContext(),
        alertsRequest('task-foreign', { kind: 'production-endpoint-alerts', limit: 500 }),
        mockResponse
      );

      expect(client.getTaskAlerts).not.toHaveBeenCalled();
      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('reads alert documents for a run in the active space', async () => {
      const docs = [{ dns: { question: { name: 'evil.example.com' } } }];
      client.getTask.mockResolvedValue({ id: 'task-1', tags: ['space:team-a'] } as never);
      client.getTaskAlerts.mockResolvedValue(docs);

      await taskAlertsHandler()(
        createContext(),
        alertsRequest('task-1', { kind: 'diagnostic-endpoint-alerts', limit: 200 }),
        mockResponse
      );

      expect(client.getTaskAlerts).toHaveBeenCalledWith(
        'task-1',
        'diagnostic-endpoint-alerts',
        200
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: docs });
    });

    it('accepts only the three service alert kinds and a bounded limit', () => {
      const { config } = router.versioned.getRoute('get', `${DETONATE_TASKS_PATH}/{taskId}/alerts`)
        .versions['1'];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      const querySchema = (validation as { request: { query: { validate(q: unknown): unknown } } })
        .request.query;

      expect(querySchema.validate({ kind: 'production-endpoint-alerts' })).toEqual({
        kind: 'production-endpoint-alerts',
        limit: 500,
      });
      expect(() => querySchema.validate({ kind: 'updates' })).toThrow();
      expect(() => querySchema.validate({ kind: '../meta' })).toThrow();
      expect(() =>
        querySchema.validate({ kind: 'production-endpoint-alerts', limit: 5000 })
      ).toThrow();
    });

    it('passes the service 404 through while the sandbox agent has not enrolled', async () => {
      client.getTask.mockResolvedValue({ id: 'task-1', tags: ['space:team-a'] } as never);
      client.getTaskAlerts.mockRejectedValue(new Ctor('not found', 404));

      await taskAlertsHandler()(
        createContext(),
        alertsRequest('task-1', { kind: 'production-detection-alerts', limit: 500 }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    const page = (tasks: unknown[]) =>
      ({ tasks, query_string: null, offset: 0, size: 20, order: 'desc' } as never);

    it('narrows a caller query to the active space and drops foreign runs', async () => {
      const own = { id: 'task-1', tags: ['space:team-a'] };
      client.listTasks.mockResolvedValue(page([own, { id: 'task-2', tags: ['space:team-b'] }]));

      await listTasksHandler()(
        createContext(),
        httpServerMock.createKibanaRequest({
          method: 'get',
          path: DETONATE_TASKS_PATH,
          query: { query_string: 'tags:demo OR tags:*' },
        }),
        mockResponse
      );

      expect(client.listTasks).toHaveBeenCalledWith({
        query_string: '(tags:demo OR tags:*) AND tags:"space:team-a"',
      });
      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({ tasks: [own] }),
      });
    });

    it('searches the runs of one alert within the active space', async () => {
      client.listTasks.mockResolvedValue(page([]));

      await alertTasksHandler()(
        createContext(),
        createRequest('get', `${DETONATE_TASKS_PATH}/alert/alert-1`, undefined, {
          alertId: 'alert-1',
        }),
        mockResponse
      );

      expect(client.listTasks).toHaveBeenCalledWith({
        query_string: 'tags:"space:team-a" AND tags:"alert:alert-1"',
      });
    });

    it('keeps the service status when the run itself is missing', async () => {
      client.getTask.mockRejectedValue(new Ctor('The detonation service answered 404.', 404));

      await getTaskHandler()(
        createContext(),
        createRequest('get', `${DETONATE_TASKS_PATH}/gone`, undefined, { taskId: 'gone' }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('run record', () => {
    const recordRequest = (id: string) =>
      createRequest('get', `${DETONATE_RUNS_PATH}/${id}/record`, undefined, { id });

    const run = {
      id: 'run-1',
      created_at: '2026-11-01T00:00:00.000Z',
      tags: ['space:team-a', 'alert:alert-1'],
      sample_hash: 'b'.repeat(64),
      last_worker_name: 'detonate.workers.make_summary',
      last_worker_status: 'success',
      vm_has_internet: false,
      vm_instance_name: 'sandbox-vm-secret-name',
      elastic_agent_id: 'sandbox-agent-secret-id',
      elastic_endpoint_id: 'sandbox-endpoint-secret-id',
      production_endpoint_alerts_count: 1,
      production_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'malicious_file' }],
      diagnostic_endpoint_alerts_count: 0,
      diagnostic_endpoint_alert_groups: [],
      production_detection_alerts_count: 0,
      production_detection_alert_groups: [],
    };

    beforeEach(() => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
    });

    it('also opens to AlertZero read, and only this route', () => {
      const [[config]] = router.versioned.get.mock.calls.filter(
        ([{ path }]) => path === RECORD_PATH
      );

      expect(config.security).toEqual({
        authz: {
          requiredPrivileges: [
            {
              anyRequired: ['securitySolution', 'securitySolution-detonateAll', 'alertzero_read'],
            },
          ],
        },
      });
    });

    it("answers 404 for another space's run without reading its timeline or alerts", async () => {
      client.getTask.mockResolvedValue({ ...run, tags: ['space:team-b'] } as never);

      await recordHandler()(createContext(), recordRequest('run-1'), mockResponse);

      expect(client.getTaskUpdates).not.toHaveBeenCalled();
      expect(client.getTaskAlerts).not.toHaveBeenCalled();
      expect(mockResponse.ok).not.toHaveBeenCalled();
      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('returns the record with duration and IOCs, and no sandbox identifiers', async () => {
      client.getTask.mockResolvedValue(run as never);
      client.getTaskUpdates.mockResolvedValue([
        { task: run, timestamp: '2026-11-01T00:03:00.000Z' },
      ] as never);
      client.getTaskAlerts.mockResolvedValue([
        { dns: { question: { name: 'evil.example.com' } } },
      ] as never);

      await recordHandler()(createContext(), recordRequest('run-1'), mockResponse);

      expect(client.getTaskAlerts).toHaveBeenCalledWith(
        'run-1',
        'production-endpoint-alerts',
        expect.any(Number)
      );
      const [[{ body }]] = mockResponse.ok.mock.calls as unknown as Array<
        [{ body: Record<string, unknown> }]
      >;
      expect(body).toMatchObject({
        'detonate.task_id': 'run-1',
        'detonate.state': 'complete',
        'detonate.verdict': 'malicious',
        'event.duration': 3 * 60 * 1000 * 1_000_000,
      });
      expect(body).toHaveProperty(['detonate.iocs.domains']);
      expect(JSON.stringify(body)).not.toContain('secret');
    });

    it('still answers when the timeline and alerts cannot be read', async () => {
      client.getTask.mockResolvedValue(run as never);
      client.getTaskUpdates.mockRejectedValue(new Error('timeline down'));
      client.getTaskAlerts.mockRejectedValue(new Error('alerts not enrolled'));

      await recordHandler()(createContext(), recordRequest('run-1'), mockResponse);

      const [[{ body }]] = mockResponse.ok.mock.calls as unknown as Array<
        [{ body: Record<string, unknown> }]
      >;
      expect(body).toMatchObject({ 'detonate.task_id': 'run-1', 'detonate.state': 'complete' });
      expect(body).not.toHaveProperty(['event.duration']);
      expect(body).not.toHaveProperty(['detonate.iocs.domains']);
    });
  });

  describe('prior-run handler', () => {
    const sha = 'a'.repeat(64);
    const malicious = {
      id: 'run-1',
      tags: ['space:default'],
      created_at: '2026-11-01T00:00:00Z',
      sample_hash: sha,
      last_worker_name: 'detonate.workers.make_summary',
      last_worker_status: 'success',
      production_endpoint_alerts_count: 2,
      production_endpoint_alert_groups: [{ alerts_count: 2, event_code: 'malicious_file' }],
      diagnostic_endpoint_alert_groups: [],
      production_detection_alert_groups: [],
    };

    it('answers known-malicious from an earlier malicious run in this space', async () => {
      client.listTasks.mockResolvedValue({ tasks: [malicious] } as never);

      await priorRunsHandler()(
        createContext(),
        createRequest('get', DETONATE_PRIOR_RUNS_PATH, undefined, { sha256: sha }),
        mockResponse
      );

      expect(client.listTasks).toHaveBeenCalledWith({
        query_string: `tags:"space:default" AND sample_hash:"${sha}"`,
        size: 20,
        order: 'desc',
      });
      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          sha256: sha,
          status: 'known-malicious',
          last_task_id: 'run-1',
        }),
      });
    });

    it('answers `unknown` when there is no prior run — never benign', async () => {
      client.listTasks.mockResolvedValue({ tasks: [] } as never);

      await priorRunsHandler()(
        createContext(),
        createRequest('get', DETONATE_PRIOR_RUNS_PATH, undefined, { sha256: 'b'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { sha256: 'b'.repeat(64), status: 'unknown', source: 'prior-detonation' },
      });
    });

    it('shapes a service error with the service status', async () => {
      const { DetonateServiceError: Ctor } = jest.requireActual<{
        DetonateServiceError: typeof DetonateServiceError;
      }>('../client');
      client.listTasks.mockRejectedValue(new Ctor('The detonation service answered 404.', 404));

      await priorRunsHandler()(
        createContext(),
        createRequest('get', DETONATE_PRIOR_RUNS_PATH, undefined, { sha256: 'c'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });
});
