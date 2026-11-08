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
  DETONATE_HANDOFFS_PATH,
  DETONATE_SUBMIT_FILE_PATH,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_PRIOR_RUNS_PATH,
  DETONATE_RUNS_PATH,
  DETONATE_TASKS_PATH,
  DETONATE_USAGE_PATH,
} from '../../../common/detonate_prototype';
import type { DetonateClient, DetonateServiceError } from '../client';
import { registerDetonatePrototypeRoutes } from '.';

const RECORD_PATH = `${DETONATE_RUNS_PATH}/{id}/record`;
/** The only routes AlertZero read also opens. */
const ALERTZERO_READ_PATHS: string[] = [RECORD_PATH, DETONATE_USAGE_PATH, DETONATE_HANDOFFS_PATH];
const HANDOFF_PATH = `${DETONATE_RUNS_PATH}/{id}/handoff`;
/** Write-tier worker routes without the `securitySolution` read tag. */
const WORKER_WRITE_PATHS: string[] = [HANDOFF_PATH, `${DETONATE_RUNS_PATH}/{id}/sandbox_count`];

describe('registerDetonatePrototypeRoutes', () => {
  let router: RouterMock;
  let mockResponse: ReturnType<typeof httpServerMock.createResponseFactory>;
  let client: jest.Mocked<DetonateClient>;
  let endpointAppContextService: {
    getActiveSpaceId: jest.Mock;
  };
  let hasDetonatePrivilege: jest.Mock;
  let esClient: {
    indices: { putIndexTemplate: jest.Mock };
    bulk: jest.Mock;
    search: jest.Mock;
    updateByQuery: jest.Mock;
    esql: { query: jest.Mock };
  };

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

  const ingestHandler = () =>
    router.versioned.getRoute('post', `${DETONATE_RUNS_PATH}/{id}/ingest`).versions['1'].handler;

  const usageHandler = () =>
    router.versioned.getRoute('get', DETONATE_USAGE_PATH).versions['1'].handler;

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

  /**
   * The sandbox-count route reads the space default index through the request
   * context; everything else ignores `context` entirely.
   */
  let uiSettingsGet: jest.Mock;
  const createContext = () =>
    ({
      core: Promise.resolve({ uiSettings: { client: { get: uiSettingsGet } } }),
    } as never);

  const register = ({
    canWrite,
    monthlyAllowance = 500,
  }: {
    canWrite: boolean;
    monthlyAllowance?: number;
  }) => {
    router = httpServiceMock.createRouter() as unknown as RouterMock;
    mockResponse = httpServerMock.createResponseFactory();
    endpointAppContextService = {
      getActiveSpaceId: jest.fn().mockReturnValue('default'),
    };
    hasDetonatePrivilege = jest.fn().mockResolvedValue(canWrite);
    esClient = {
      indices: { putIndexTemplate: jest.fn().mockResolvedValue({ acknowledged: true }) },
      bulk: jest.fn(),
      search: jest.fn(),
      updateByQuery: jest.fn(),
      esql: { query: jest.fn() },
    };
    registerDetonatePrototypeRoutes({
      router: router as never,
      logger: loggerMock.create(),
      getClient: () => client,
      endpointAppContextService: endpointAppContextService as never,
      hasDetonatePrivilege,
      monthlyAllowance,
      getInternalEsClient: async () => esClient as never,
      now: () => new Date('2026-12-15T10:00:00.000Z'),
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
    uiSettingsGet = jest.fn().mockResolvedValue(['logs-*']);
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
        .filter(
          ({ path }) => !ALERTZERO_READ_PATHS.includes(path) && !WORKER_WRITE_PATHS.includes(path)
        )
        .map(({ security }) => security);

      expect(securityConfigs.length).toBe(
        routeConfigs.length - ALERTZERO_READ_PATHS.length - WORKER_WRITE_PATHS.length
      );
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

    it.each(ALERTZERO_READ_PATHS)('%s also opens to AlertZero read', (path) => {
      const [[config]] = router.versioned.get.mock.calls.filter(
        ([registered]) => registered.path === path
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

  describe('sandbox ingest', () => {
    const ingestRequest = (id: string) =>
      createRequest('post', `${DETONATE_RUNS_PATH}/${id}/ingest`, undefined, { id });

    const run = {
      id: 'run-1',
      created_at: '2026-11-01T00:00:00.000Z',
      tags: ['space:team-a'],
      last_worker_name: 'detonate.workers.make_summary',
      last_worker_status: 'success',
      production_endpoint_alerts_count: 2,
      production_endpoint_alert_groups: [],
      diagnostic_endpoint_alerts_count: 1,
      diagnostic_endpoint_alert_groups: [],
      production_detection_alerts_count: 0,
      production_detection_alert_groups: [],
    };
    const alert = (eventId: string, timestamp?: string) => ({
      ...(timestamp ? { '@timestamp': timestamp } : {}),
      event: { id: eventId, kind: 'alert' },
      host: { name: 'sandbox-host-secret-name', os: { type: 'linux' } },
    });

    beforeEach(() => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
    });

    const ingestBody = () => {
      const [[{ body }]] = mockResponse.ok.mock.calls as unknown as Array<
        [{ body: Record<string, unknown> }]
      >;
      return body;
    };

    it('copies the readable alerts into the space stream and reports counts', async () => {
      client.getTask.mockResolvedValue(run as never);
      client.getTaskAlerts.mockImplementation(async (_id, kind) =>
        kind === 'production-endpoint-alerts'
          ? [alert('e-1', '2026-11-01T00:01:00.000Z'), alert('e-2')]
          : Promise.reject(new Error('not enrolled'))
      );
      esClient.bulk.mockResolvedValue({ items: [{ create: { status: 201 } }] });

      await ingestHandler()(createContext(), ingestRequest('run-1'), mockResponse);

      expect(ingestBody()).toEqual({
        task_id: 'run-1',
        stream: '.kibana-detonate-sandbox-team-a',
        ingested: 1,
        duplicates: 0,
        dropped: 1,
        failed: 0,
        unread_kinds: ['diagnostic-endpoint-alerts'],
      });
      expect(client.getTaskAlerts).not.toHaveBeenCalledWith(
        'run-1',
        'production-detection-alerts',
        expect.anything()
      );
      const [[{ operations }]] = esClient.bulk.mock.calls;
      expect(operations[0]).toEqual({
        create: { _index: '.kibana-detonate-sandbox-team-a', _id: 'run-1:e-1' },
      });
      expect(JSON.stringify(operations)).not.toContain('secret');
    });

    it('installs the template once across calls', async () => {
      client.getTask.mockResolvedValue(run as never);
      client.getTaskAlerts.mockResolvedValue([]);

      await ingestHandler()(createContext(), ingestRequest('run-1'), mockResponse);
      await ingestHandler()(createContext(), ingestRequest('run-1'), mockResponse);

      expect(esClient.indices.putIndexTemplate).toHaveBeenCalledTimes(1);
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    it('retries the template install after a failure', async () => {
      client.getTask.mockResolvedValue(run as never);
      client.getTaskAlerts.mockResolvedValue([]);
      esClient.indices.putIndexTemplate.mockRejectedValueOnce(new Error('cluster busy'));

      await ingestHandler()(createContext(), ingestRequest('run-1'), mockResponse);
      await ingestHandler()(createContext(), ingestRequest('run-1'), mockResponse);

      expect(esClient.indices.putIndexTemplate).toHaveBeenCalledTimes(2);
      expect(mockResponse.ok).toHaveBeenCalledTimes(1);
    });

    it('answers 404 for another space and writes nothing', async () => {
      client.getTask.mockResolvedValue({ ...run, tags: ['space:team-b'] } as never);

      await ingestHandler()(createContext(), ingestRequest('run-1'), mockResponse);

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
      expect(client.getTaskAlerts).not.toHaveBeenCalled();
      expect(esClient.indices.putIndexTemplate).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    it('rejects a read-only analyst before touching the service or Elasticsearch', async () => {
      register({ canWrite: false });

      await ingestHandler()(createContext(), ingestRequest('run-1'), mockResponse);

      expect(mockResponse.forbidden).toHaveBeenCalled();
      expect(client.getTask).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });
  });

  describe('usage', () => {
    const usageRequest = () => createRequest('get', DETONATE_USAGE_PATH);
    const run = (id: string, createdAt: string, space = 'team-a') => ({
      id,
      created_at: createdAt,
      tags: [`space:${space}`],
    });
    const serveNewestFirst = (tasks: unknown[]) =>
      client.listTasks.mockImplementation(async ({ offset = 0, size = 20 } = {}) => ({
        tasks: tasks.slice(offset, offset + size) as never,
        offset,
        size,
        order: 'desc',
      }));
    const usageBody = () =>
      (mockResponse.ok.mock.calls as unknown as Array<[{ body: unknown }]>)[0][0].body;

    beforeEach(() => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
    });

    it("counts this space's runs in the current UTC month", async () => {
      serveNewestFirst([
        run('dec-2', '2026-12-14T00:00:00.000Z'),
        run('other-space', '2026-12-13T00:00:00.000Z', 'team-b'),
        run('dec-1', '2026-12-01T00:00:00.000Z'),
        run('nov', '2026-11-30T23:59:59.999Z'),
      ]);

      await usageHandler()(createContext(), usageRequest(), mockResponse);

      expect(usageBody()).toEqual({
        used: 2,
        allowance: 500,
        since: '2026-12-01T00:00:00.000Z',
        resetsAt: '2027-01-01T00:00:00.000Z',
        truncated: false,
      });
      expect(client.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ query_string: 'tags:"space:team-a"', order: 'desc' })
      );
    });

    it('reports the configured allowance', async () => {
      register({ canWrite: true, monthlyAllowance: 25 });
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
      serveNewestFirst([]);

      await usageHandler()(createContext(), usageRequest(), mockResponse);

      expect(usageBody()).toMatchObject({ used: 0, allowance: 25 });
    });

    it('shapes a service error with the service status', async () => {
      const { DetonateServiceError: Ctor } = jest.requireActual<{
        DetonateServiceError: typeof DetonateServiceError;
      }>('../client');
      client.listTasks.mockRejectedValue(new Ctor('The detonation service answered 503.', 503));

      await usageHandler()(createContext(), usageRequest(), mockResponse);

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 503 })
      );
      expect(mockResponse.ok).not.toHaveBeenCalled();
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

  describe('worker handoffs', () => {
    const listHandler = () =>
      router.versioned.getRoute('get', DETONATE_HANDOFFS_PATH).versions['1'].handler;
    const setHandler = () => router.versioned.getRoute('post', HANDOFF_PATH).versions['1'].handler;
    const listRequest = (marker: string) =>
      httpServerMock.createKibanaRequest({
        method: 'get',
        path: DETONATE_HANDOFFS_PATH,
        query: { marker },
      });
    const setRequest = (id: string, body: unknown) =>
      createRequest('post', HANDOFF_PATH, body, { id });

    const run = (id: string, alertIds: string[], space = 'default') => ({
      id,
      created_at: '2026-12-01T00:00:00.000Z',
      sample_hash: `hash-${id}`,
      tags: [`space:${space}`, ...alertIds.map((alertId) => `alert:${alertId}`)],
    });
    const alertHit = (id: string, tags: string[]) => ({
      _id: id,
      _source: {
        file: { hash: { sha256: `alert-hash-${id}` } },
        kibana: { alert: { workflow_tags: tags } },
      },
    });
    /** Answers each `tags:"alert:<id>"` lookup with the runs carrying that tag. */
    const serveRuns = (runs: unknown[]) =>
      client.listTasks.mockImplementation(async ({ query_string: queryString = '' } = {}) => {
        const alertTag = /tags:"(alert:[^"]+)"/.exec(queryString)?.[1];
        return {
          tasks: (runs as Array<{ tags: string[] }>).filter((r) => r.tags.includes(alertTag ?? '')),
          offset: 0,
          size: 1,
          order: 'desc',
        } as never;
      });
    const bodySchema = () => {
      const { config } = router.versioned.getRoute('post', HANDOFF_PATH).versions['1'];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      return (validation as { request: { body: { validate(body: unknown): unknown } } }).request
        .body;
    };
    const querySchema = () => {
      const { config } = router.versioned.getRoute('get', DETONATE_HANDOFFS_PATH).versions['1'];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      return (validation as { request: { query: { validate(query: unknown): unknown } } }).request
        .query;
    };

    it('opens the set route only to the Detonate privilege or AlertZero write', () => {
      const [[config]] = router.versioned.post.mock.calls.filter(
        ([registered]) => registered.path === HANDOFF_PATH
      );

      expect(config.security).toEqual({
        authz: {
          requiredPrivileges: [
            { anyRequired: ['securitySolution-detonateAll', 'alertzero_write'] },
          ],
        },
      });
    });

    it('lists only from this space, oldest first, by the hunt selector', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      const [[searchRequest]] = esClient.search.mock.calls;
      expect(searchRequest.index).toBe('.alerts-security.alerts-default');
      expect(searchRequest.size).toBe(100);
      expect(searchRequest.sort).toEqual([
        { '@timestamp': { order: 'asc', unmapped_type: 'date' } },
      ]);
      expect(searchRequest._source).toEqual(['file.hash.sha256', 'kibana.alert.workflow_tags']);
      expect(searchRequest.query.bool.filter).toEqual([
        { term: { 'kibana.space_ids': 'default' } },
        { exists: { field: 'file.hash.sha256' } },
        {
          bool: {
            should: [
              { term: { 'kibana.alert.workflow_tags': 'detonate:hunt-requested' } },
              {
                bool: {
                  filter: [{ term: { 'kibana.alert.workflow_tags': 'detonate:malicious' } }],
                  must_not: [{ term: { 'kibana.alert.workflow_tags': 'detonate:hunt-done' } }],
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
      ]);
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { handoffs: [] } });
    });

    it('selects the coverage markers for the Detection Worker', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('coverage'), mockResponse);

      const selector = JSON.stringify(esClient.search.mock.calls[0][0].query);
      expect(selector).toContain('detonate:coverage-requested');
      expect(selector).toContain('detonate:coverage-reviewed');
      expect(selector).not.toContain('detonate:hunt-');
    });

    // A run whose rule-creation copy is parked carries coverage-in-progress;
    // the sweep skips it. It must be excluded from the scan itself, not only
    // from the re-check, or in-progress alerts would consume the scan window
    // and hide a valid handoff behind them.
    it('excludes runs with a parked rule-creation copy from the coverage scan', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('coverage'), mockResponse);

      const selector = JSON.stringify(esClient.search.mock.calls[0][0].query);
      expect(selector).toContain('detonate:coverage-in-progress');
      expect(selector).toContain('must_not');
    });

    it('keeps the hunt scan free of the coverage lock', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      const selector = JSON.stringify(esClient.search.mock.calls[0][0].query);
      expect(selector).not.toContain('detonate:coverage-in-progress');
    });

    it('accepts only the two Worker kinds', () => {
      expect(querySchema().validate({ marker: 'hunt' })).toEqual({ marker: 'hunt' });
      expect(() => querySchema().validate({ marker: 'detonate:malicious' })).toThrow();
      expect(() => querySchema().validate({})).toThrow();
    });

    it('groups alerts by their run and drops alerts with no run in this space', async () => {
      esClient.search.mockResolvedValue({
        hits: {
          hits: [
            alertHit('a-1', ['detonate:malicious']),
            alertHit('a-orphan', ['detonate:malicious']),
            alertHit('a-foreign', ['detonate:malicious']),
            alertHit('a-2', ['detonate:hunt-requested']),
          ],
        },
      });
      serveRuns([run('run-1', ['a-1', 'a-2']), run('run-x', ['a-foreign'], 'team-b')]);

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { handoffs: [{ task_id: 'run-1', sha256: 'hash-run-1', alert_ids: ['a-1', 'a-2'] }] },
      });
    });

    it('re-checks the selector on what Elasticsearch returned', async () => {
      esClient.search.mockResolvedValue({
        hits: { hits: [alertHit('a-1', ['detonate:malicious', 'detonate:hunt-done'])] },
      });
      serveRuns([run('run-1', ['a-1'])]);

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(client.listTasks).not.toHaveBeenCalled();
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { handoffs: [] } });
    });

    it('finds a valid handoff behind a backlog of run-less alerts', async () => {
      const orphans = Array.from({ length: 10 }, (_, i) =>
        alertHit(`orphan-${i}`, ['detonate:malicious'])
      );
      esClient.search.mockResolvedValue({
        hits: { hits: [...orphans, alertHit('a-new', ['detonate:malicious'])] },
      });
      serveRuns([run('run-new', ['a-new'])]);

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { handoffs: [{ task_id: 'run-new', sha256: 'hash-run-new', alert_ids: ['a-new'] }] },
      });
    });

    it('returns at most five runs', async () => {
      const ids = Array.from({ length: 8 }, (_, i) => `a-${i}`);
      esClient.search.mockResolvedValue({
        hits: { hits: ids.map((id) => alertHit(id, ['detonate:malicious'])) },
      });
      serveRuns(ids.map((id) => run(`run-${id}`, [id])));

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      const [[{ body }]] = mockResponse.ok.mock.calls as unknown as Array<
        [{ body: { handoffs: Array<{ task_id: string }> } }]
      >;
      expect(body.handoffs.map(({ task_id: taskId }) => taskId)).toEqual([
        'run-a-0',
        'run-a-1',
        'run-a-2',
        'run-a-3',
        'run-a-4',
      ]);
    });

    it("rewrites markers on the run's own alerts in this space only", async () => {
      client.getTask.mockResolvedValue(run('run-1', ['a-1', 'a-2', 'a-1']) as never);
      esClient.updateByQuery.mockResolvedValue({ updated: 2 });

      await setHandler()(
        createContext(),
        setRequest('run-1', { add: ['detonate:hunt-done'], remove: ['detonate:hunt-requested'] }),
        mockResponse
      );

      const [[update]] = esClient.updateByQuery.mock.calls;
      expect(update.index).toBe('.alerts-security.alerts-default');
      expect(update.conflicts).toBe('proceed');
      expect(update.refresh).toBe(true);
      expect(update.query).toEqual({
        bool: {
          filter: [{ terms: { _id: ['a-1', 'a-2'] } }, { term: { 'kibana.space_ids': 'default' } }],
        },
      });
      expect(update.script.params).toEqual({
        tagsToAdd: ['detonate:hunt-done'],
        tagsToRemove: ['detonate:hunt-requested'],
      });
      expect(update.script.source).not.toContain('detonate:');
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { updated: 2 } });
    });

    it("answers 404 for another space's run and updates nothing", async () => {
      client.getTask.mockResolvedValue(run('run-1', ['a-1'], 'team-b') as never);

      await setHandler()(
        createContext(),
        setRequest('run-1', { add: ['detonate:hunt-done'] }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
      expect(esClient.updateByQuery).not.toHaveBeenCalled();
    });

    it('updates nothing for a run started from no alert', async () => {
      client.getTask.mockResolvedValue(run('run-1', []) as never);

      await setHandler()(
        createContext(),
        setRequest('run-1', { add: ['detonate:coverage-reviewed'] }),
        mockResponse
      );

      expect(esClient.updateByQuery).not.toHaveBeenCalled();
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { updated: 0 } });
    });

    it('accepts only the five handoff markers, and at least one', () => {
      expect(bodySchema().validate({ add: ['detonate:hunt-requested'] })).toEqual({
        add: ['detonate:hunt-requested'],
      });
      expect(bodySchema().validate({ remove: ['detonate:coverage-in-progress'] })).toEqual({
        remove: ['detonate:coverage-in-progress'],
      });
      expect(() => bodySchema().validate({ add: ['detonate:malicious'] })).toThrow();
      expect(() => bodySchema().validate({ remove: ['detonate:benign'] })).toThrow();
      expect(() => bodySchema().validate({})).toThrow();
      expect(() => bodySchema().validate({ add: [], remove: [] })).toThrow();
      expect(() => bodySchema().validate({ add: Array(6).fill('detonate:hunt-done') })).toThrow();
    });
  });

  describe('sandbox count', () => {
    const SANDBOX_COUNT_PATH = `${DETONATE_RUNS_PATH}/{id}/sandbox_count`;
    const handler = () =>
      router.versioned.getRoute('post', SANDBOX_COUNT_PATH).versions['1'].handler;
    const request = (id: string, ruleQuery: string) =>
      createRequest('post', SANDBOX_COUNT_PATH, { rule_query: ruleQuery }, { id });
    /** The one task id every test starts from: this space, one alert. */
    const ownRun = () =>
      client.getTask.mockResolvedValue({
        id: 'run-1',
        tags: ['space:default', 'alert:a-1'],
      } as never);

    it('opens the route only to the Detonate privilege or AlertZero write', () => {
      const [[config]] = router.versioned.post.mock.calls.filter(
        ([registered]) => registered.path === SANDBOX_COUNT_PATH
      );

      expect(config.security).toEqual({
        authz: {
          requiredPrivileges: [
            { anyRequired: ['securitySolution-detonateAll', 'alertzero_write'] },
          ],
        },
      });
    });

    it('counts matching sandbox docs for the path id as the internal user', async () => {
      ownRun();
      esClient.esql.query.mockResolvedValue({ columns: [{ name: 'c' }], values: [[7]] });

      await handler()(
        createContext(),
        request('run-1', 'FROM logs-* | WHERE process.command_line LIKE "*curl*"'),
        mockResponse
      );

      const [[esqlRequest]] = esClient.esql.query.mock.calls;
      expect(esqlRequest.query).toContain('FROM .kibana-detonate-sandbox-default');
      expect(esqlRequest.query).toContain('`detonate.task_id` == "run-1"');
      expect(esqlRequest.query).toContain('STATS c = COUNT(*)');
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { count: 7 } });
    });

    it('keeps the path id as the one task filter whatever the body predicates', async () => {
      ownRun();
      esClient.esql.query.mockResolvedValue({ columns: [{ name: 'c' }], values: [[0]] });

      await handler()(
        createContext(),
        request(
          'run-1',
          'FROM logs-* | WHERE detonate.task_id == "other" OR process.name == "curl"'
        ),
        mockResponse
      );

      const [[esqlRequest]] = esClient.esql.query.mock.calls;
      // The builder inserts its WHERE directly after FROM, so the body's own
      // predicate is AND-constrained by the path id: `task_id == "other"` can
      // only narrow the read, never widen it past the path id's rows.
      expect(esqlRequest.query).toContain('`detonate.task_id` == "run-1"');
      // The inserted filter is the first WHERE; anything from the body follows.
      expect(esqlRequest.query.indexOf('`detonate.task_id` == "run-1"')).toBeLessThan(
        esqlRequest.query.indexOf('detonate.task_id == "other"')
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { count: 0 } });
    });

    it.each([
      ['a LOOKUP JOIN', 'FROM logs-* | LOOKUP JOIN dept ON host'],
      ['an ENRICH', 'FROM logs-* | ENRICH policy ON host'],
      ['a TS', 'TS metrics'],
      ['a subquery', 'FROM logs-* | WHERE host.name IN (FROM other | KEEP host)'],
      ['a SET header', 'SET project_routing = "x"; FROM logs-*'],
      ['a remote: prefix', 'FROM remote:logs-*'],
      ['a sandbox source', 'FROM .kibana-detonate-sandbox-default, <x-{now/d}>'],
      ['a :: selector', 'FROM logs-*::failures'],
    ])('rejects %s at the guard', async (_name, ruleQuery) => {
      ownRun();

      await handler()(createContext(), request('run-1', ruleQuery), mockResponse);

      expect(mockResponse.badRequest).toHaveBeenCalled();
      expect(esClient.esql.query).not.toHaveBeenCalled();
    });

    it('answers count 0 when the space sandbox stream does not exist yet', async () => {
      ownRun();
      const { errors } = jest.requireActual<{
        errors: typeof import('@elastic/elasticsearch').errors;
      }>('@elastic/elasticsearch');
      esClient.esql.query.mockRejectedValue(
        new errors.ResponseError({
          body: {
            error: {
              type: 'verification_exception',
              reason: 'Unknown index [.kibana-detonate-sandbox-default]',
              root_cause: [
                {
                  type: 'verification_exception',
                  reason: 'Unknown index [.kibana-detonate-sandbox-default]',
                },
              ],
            },
          },
          statusCode: 400,
          headers: {},
        })
      );

      await handler()(
        createContext(),
        request('run-1', 'FROM logs-* | WHERE process.command_line LIKE "*curl*"'),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { count: 0 } });
    });

    it('still 500s when the ES|QL failure names a different index', async () => {
      ownRun();
      const { errors } = jest.requireActual<{
        errors: typeof import('@elastic/elasticsearch').errors;
      }>('@elastic/elasticsearch');
      esClient.esql.query.mockRejectedValue(
        new errors.ResponseError({
          body: {
            error: {
              type: 'verification_exception',
              reason: 'Unknown index [.internal.alerts-security.alerts-default]',
              root_cause: [
                {
                  type: 'verification_exception',
                  reason: 'Unknown index [.internal.alerts-security.alerts-default]',
                },
              ],
            },
          },
          statusCode: 400,
          headers: {},
        })
      );

      await handler()(createContext(), request('run-1', 'FROM logs-*'), mockResponse);

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
    });

    it("answers 404 for another space's run", async () => {
      client.getTask.mockResolvedValue({
        id: 'run-1',
        tags: ['space:team-b'],
      } as never);

      await handler()(createContext(), request('run-1', 'FROM logs-*'), mockResponse);

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
      expect(esClient.esql.query).not.toHaveBeenCalled();
    });

    it('rejects an over-long body', () => {
      const { config } = router.versioned.getRoute('post', SANDBOX_COUNT_PATH).versions['1'];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      const body = (validation as { request: { body: { validate(b: unknown): unknown } } }).request
        .body;

      expect(() => body.validate({ rule_query: 'a'.repeat(10_001) })).toThrow();
      expect(() => body.validate({ rule_query: 'FROM logs-*' })).not.toThrow();
    });
  });
});
