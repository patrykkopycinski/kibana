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
  DETONATE_ALERT_OUTCOMES_PATH,
  DETONATE_DECISIONS_PATH,
  DETONATE_SWEEP_CANDIDATES_PATH,
  DETONATE_HANDOFFS_PATH,
  DETONATE_SUBMIT_FILE_PATH,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_PRIOR_RUNS_PATH,
  DETONATE_RUNS_PATH,
  DETONATE_RUNS_STATS_PATH,
  DETONATE_TASKS_PATH,
  DETONATE_USAGE_PATH,
  DETONATION_RUNS_SORT_FIELDS,
} from '../../../common/detonate_prototype';
import type { DetonateClient, DetonateServiceError } from '../client';
import { createRunRecorder } from '../results_store';
import { registerDetonatePrototypeRoutes } from '.';

/** The results writes are fire-and-forget, so a test waits for them to settle before asserting. */
const flushWrites = () => new Promise<void>((resolve) => setImmediate(resolve));

const RECORD_PATH = `${DETONATE_RUNS_PATH}/{id}/record`;
/** The only routes AlertZero read also opens. */
const ALERTZERO_READ_PATHS: string[] = [RECORD_PATH, DETONATE_USAGE_PATH];
const HANDOFF_PATH = `${DETONATE_RUNS_PATH}/{id}/handoff`;
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
/** Write-tier worker routes without the `securitySolution` read tag. */
const WORKER_WRITE_PATHS: string[] = [
  HANDOFF_PATH,
  DETONATE_HANDOFFS_PATH,
  DETONATE_DECISIONS_PATH,
  DETONATE_ALERT_OUTCOMES_PATH,
  DETONATE_SWEEP_CANDIDATES_PATH,
  `${DETONATE_RUNS_PATH}/{id}/sandbox_count`,
];

/** What the record mapper reads from every task the service returns. */
const NO_ALERT_GROUPS = {
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
};

describe('registerDetonatePrototypeRoutes', () => {
  let router: RouterMock;
  let mockResponse: ReturnType<typeof httpServerMock.createResponseFactory>;
  let client: jest.Mocked<DetonateClient>;
  let endpointAppContextService: {
    getActiveSpaceId: jest.Mock;
    getCurrentUsername: jest.Mock;
  };
  let hasDetonatePrivilege: jest.Mock;
  let esClient: {
    indices: { putIndexTemplate: jest.Mock; putMapping: jest.Mock; refresh: jest.Mock };
    bulk: jest.Mock;
    mget: jest.Mock;
    update: jest.Mock;
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
   * The submit-hash body validator is a route validation function, so it is run the
   * way the HTTP router does: a `{ value }` result is the validated body, an
   * `{ error }` result is the 400 the router would answer, thrown here.
   */
  const submitHashBodySchema = () => {
    const { config } = router.versioned.getRoute('post', DETONATE_SUBMIT_HASH_PATH).versions['1'];
    const validation = typeof config.validate === 'function' ? config.validate() : config.validate;
    if (!validation || !validation.request) {
      throw new Error('submit-hash route registered without request validation');
    }
    const validateBody = validation.request.body as (
      body: unknown,
      factory: {
        ok: (value: unknown) => { value: unknown };
        badRequest: (error: Error) => { error: Error };
      }
    ) => { value: unknown } | { error: Error };
    return {
      validate: (body: unknown) => {
        const result = validateBody(body, {
          ok: (value) => ({ value }),
          badRequest: (error) => ({ error }),
        });
        if ('error' in result) throw result.error;
        return result.value;
      },
    };
  };

  /**
   * The sandbox-count route reads the space default index through the request
   * context; everything else ignores `context` entirely.
   */
  let uiSettingsGet: jest.Mock;
  /** The caller's own ES client, kept apart from the internal one to prove whose identity reads. */
  let callerSearch: jest.Mock;
  /** The caller's own client routed across the space's projects; the decisions route reads through it. */
  let scopedSearch: jest.Mock;
  const createContext = () =>
    ({
      core: Promise.resolve({
        uiSettings: { client: { get: uiSettingsGet } },
        elasticsearch: { client: { asCurrentUser: { search: callerSearch } } },
      }),
    } as never);
  const callerCanRead = (ids: string[]) =>
    callerSearch.mockResolvedValue({ hits: { hits: ids.map((_id) => ({ _id })) } });
  const scopedCanRead = (ids: string[]) =>
    scopedSearch.mockResolvedValue({ hits: { hits: ids.map((_id) => ({ _id })) } });

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
      getCurrentUsername: jest.fn().mockReturnValue('analyst'),
    };
    hasDetonatePrivilege = jest.fn().mockResolvedValue(canWrite);
    esClient = {
      indices: {
        putIndexTemplate: jest.fn().mockResolvedValue({ acknowledged: true }),
        putMapping: jest.fn().mockResolvedValue({ acknowledged: true }),
        refresh: jest.fn().mockResolvedValue({ _shards: { successful: 1 } }),
      },
      bulk: jest.fn(),
      mget: jest.fn(),
      update: jest.fn().mockResolvedValue({ result: 'created' }),
      search: jest.fn(),
      updateByQuery: jest.fn(),
      esql: { query: jest.fn() },
    };
    const logger = loggerMock.create();
    registerDetonatePrototypeRoutes({
      router: router as never,
      logger,
      getClient: () => client,
      endpointAppContextService: endpointAppContextService as never,
      recordRun: createRunRecorder({ getInternalEsClient: async () => esClient as never, logger }),
      hasDetonatePrivilege,
      monthlyAllowance,
      getInternalEsClient: async () => esClient as never,
      getScopedEsClient: async () => ({ search: scopedSearch } as never),
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
      getTaskProcessEvents: jest.fn(),
      listTasks: jest.fn(),
      findTasksByHash: jest.fn(),
    };
    uiSettingsGet = jest.fn().mockResolvedValue(['logs-*']);
    callerSearch = jest.fn().mockResolvedValue({ hits: { hits: [] } });
    scopedSearch = jest.fn().mockResolvedValue({ hits: { hits: [] } });
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

    describe('results store', () => {
      const submit = (origin?: unknown) =>
        submitHashHandler()(
          createContext(),
          createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
            sample_hash: 'a'.repeat(64),
            tags: ['alert:alert-1'],
            ...(origin ? { origin } : {}),
          }),
          mockResponse
        );

      beforeEach(() => {
        callerCanRead(['alert-1']);
        client.submitHash.mockResolvedValue({
          id: 'task-1',
          created_at: '2026-12-15T10:00:00.000Z',
          tags: ['space:default', 'alert:alert-1'],
          ...NO_ALERT_GROUPS,
        } as never);
      });

      it('strips the origin before the service call and writes it with the submit', async () => {
        await submit({ source: 'alert_flyout', host_name: 'host-1' });
        await flushWrites();

        expect(client.submitHash).toHaveBeenCalledWith({
          sample_hash: 'a'.repeat(64),
          tags: ['alert:alert-1', 'space:default'],
        });
        expect(esClient.update).toHaveBeenCalledTimes(1);
        expect(esClient.update).toHaveBeenCalledWith(
          expect.objectContaining({
            index: '.kibana-detonate-results-default',
            id: 'task-1',
            doc_as_upsert: true,
            doc: expect.objectContaining({
              'detonate.space_id': 'default',
              'detonate.source': 'alert_flyout',
              'detonate.submitter': 'analyst',
              'detonate.origin.alert_ids': ['alert-1'],
              'host.name': 'host-1',
            }),
          }),
          { requestTimeout: 2000, maxRetries: 0 }
        );
      });

      it('still answers with the task when the write fails', async () => {
        esClient.update.mockRejectedValue(new Error('es down'));

        await submit({ source: 'detonate_page' });

        expect(mockResponse.ok).toHaveBeenCalledWith({
          body: expect.objectContaining({ id: 'task-1' }),
        });
        expect(mockResponse.customError).not.toHaveBeenCalled();
      });

      it('rejects an origin alert id the caller cannot read, like an alert tag, and does not submit', async () => {
        callerCanRead(['alert-1']);

        await submit({ source: 'agent', alert_ids: ['alert-foreign'] });

        expect(mockResponse.customError).toHaveBeenCalledWith({
          statusCode: 400,
          body: { message: expect.stringContaining('alert-foreign') },
        });
        expect(client.submitHash).not.toHaveBeenCalled();
        expect(esClient.update).not.toHaveBeenCalled();
      });

      it('checks origin alert ids with the tagged alerts, and sends the service only the tags', async () => {
        callerCanRead(['alert-1', 'alert-2']);

        await submit({ source: 'agent', alert_ids: ['alert-2'] });

        const [[searchRequest]] = callerSearch.mock.calls;
        expect(searchRequest.query.bool.filter[0]).toEqual({
          ids: { values: ['alert-1', 'alert-2'] },
        });
        expect(client.submitHash).toHaveBeenCalledWith({
          sample_hash: 'a'.repeat(64),
          tags: ['alert:alert-1', 'space:default'],
        });
      });

      it.each([
        ['an unknown source', { source: 'somewhere' }],
        ['too many alert ids', { alert_ids: Array.from({ length: 33 }, (_, i) => `a${i}`) }],
        ['an oversized alert id', { alert_ids: ['a'.repeat(129)] }],
        ['an oversized conversation id', { conversation_id: 'c'.repeat(129) }],
      ])('rejects %s in the origin', (_name, origin) => {
        expect(() =>
          submitHashBodySchema().validate({ sample_hash: 'a'.repeat(64), origin })
        ).toThrow();
      });

      it('cuts an oversized host name, user name and file path to their bounds instead of rejecting', () => {
        const validated = submitHashBodySchema().validate({
          sample_hash: 'a'.repeat(64),
          origin: {
            source: 'alert_flyout',
            host_name: 'h'.repeat(300),
            user_name: 'u'.repeat(300),
            file_path: 'p'.repeat(5000),
          },
        }) as { origin: Record<string, string> };

        expect(validated.origin).toEqual({
          source: 'alert_flyout',
          host_name: 'h'.repeat(256),
          user_name: 'u'.repeat(256),
          file_path: 'p'.repeat(4096),
        });
      });

      it('accepts a full, in-bounds origin', () => {
        expect(() =>
          submitHashBodySchema().validate({
            sample_hash: 'a'.repeat(64),
            origin: {
              source: 'workflow',
              alert_ids: ['alert-1'],
              host_name: 'host-1',
              user_name: 'user-1',
              file_path: '/tmp/x',
              workflow_execution_id: 'exec-1',
              conversation_id: 'conv-1',
            },
          })
        ).not.toThrow();
      });
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

    it('skips the alert lookup when no alert tags are given', async () => {
      client.submitHash.mockResolvedValue({ id: 'task-1' } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
          sample_hash: 'a'.repeat(64),
          tags: ['demo'],
        }),
        mockResponse
      );

      expect(callerSearch).not.toHaveBeenCalled();
      expect(client.submitHash).toHaveBeenCalledTimes(1);
    });

    it('checks alert tags against the alerts the caller can read in this space', async () => {
      callerCanRead(['alert-1', 'alert-2']);
      client.submitHash.mockResolvedValue({ id: 'task-1' } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
          sample_hash: 'a'.repeat(64),
          tags: ['alert:alert-1', 'alert:alert-2', 'alert:alert-1'],
        }),
        mockResponse
      );

      const [[searchRequest]] = callerSearch.mock.calls;
      expect(searchRequest).toEqual(
        expect.objectContaining({
          index: '.alerts-security.alerts-default',
          ignore_unavailable: true,
          size: 2,
          _source: false,
          query: {
            bool: {
              filter: [
                { ids: { values: ['alert-1', 'alert-2'] } },
                { term: { 'kibana.space_ids': 'default' } },
              ],
            },
          },
        })
      );
      expect(esClient.search).not.toHaveBeenCalled();
      expect(client.submitHash).toHaveBeenCalledTimes(1);
      expect(mockResponse.ok).toHaveBeenCalled();
    });

    it('rejects an alert tag the caller cannot read with 400 and does not submit', async () => {
      callerCanRead(['alert-1']);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
          sample_hash: 'a'.repeat(64),
          tags: ['alert:alert-1', 'alert:alert-foreign'],
        }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 400,
        body: { message: expect.stringContaining('alert-foreign') },
      });
      expect(client.submitHash).not.toHaveBeenCalled();
    });

    it('rejects alert tags with 400 when the caller has no read access to the alerts index', async () => {
      callerSearch.mockRejectedValue(
        Object.assign(new Error('security_exception'), { statusCode: 403 })
      );

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
          sample_hash: 'a'.repeat(64),
          tags: ['alert:alert-1'],
        }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
      expect(client.submitHash).not.toHaveBeenCalled();
    });

    it('fails the submit with 500, not 400, when the alert lookup errors for another reason', async () => {
      callerSearch.mockRejectedValue(
        Object.assign(new Error('shard failure'), { statusCode: 503 })
      );

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
          sample_hash: 'a'.repeat(64),
          tags: ['alert:alert-1'],
        }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
      expect(client.submitHash).not.toHaveBeenCalled();
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

    it('writes the file facts with the origin, and strips the origin from the service call', async () => {
      client.submitFile.mockResolvedValue({
        id: 'task-3',
        created_at: '2026-12-15T10:00:00.000Z',
        tags: ['space:default'],
        ...NO_ALERT_GROUPS,
      } as never);

      await submitFileHandler()(
        createContext(),
        createFileRequest('{"origin":{"source":"detonate_page"}}'),
        mockResponse
      );
      await flushWrites();

      expect(client.submitFile).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(client.submitFile.mock.calls)).not.toContain('detonate_page');
      expect(esClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-3',
          doc: expect.objectContaining({
            'detonate.source': 'detonate_page',
            'detonate.submitter': 'analyst',
            'file.size': 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'.length,
          }),
        }),
        { requestTimeout: 2000, maxRetries: 0 }
      );
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
      expect(callerSearch).not.toHaveBeenCalled();
    });

    it('submits when every alert tag in request_json names an alert the caller can read', async () => {
      callerCanRead(['alert-1']);
      client.submitFile.mockResolvedValue({ id: 'task-2' } as never);

      await submitFileHandler()(
        createContext(),
        createFileRequest('{"tags":["alert:alert-1"]}'),
        mockResponse
      );

      expect(callerSearch).toHaveBeenCalledTimes(1);
      expect(client.submitFile).toHaveBeenCalledTimes(1);
    });

    it('submits with an oversized origin host, user and path cut to their bounds', async () => {
      client.submitFile.mockResolvedValue({
        id: 'task-5',
        created_at: '2026-12-15T10:00:00.000Z',
        tags: ['space:default'],
        ...NO_ALERT_GROUPS,
      } as never);

      await submitFileHandler()(
        createContext(),
        createFileRequest(
          JSON.stringify({
            origin: {
              source: 'alert_flyout',
              host_name: 'h'.repeat(300),
              user_name: 'u'.repeat(300),
              file_path: 'p'.repeat(5000),
            },
          })
        ),
        mockResponse
      );
      await flushWrites();

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(client.submitFile).toHaveBeenCalledTimes(1);
      expect(esClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          doc: expect.objectContaining({
            'host.name': 'h'.repeat(256),
            'user.name': 'u'.repeat(256),
          }),
        }),
        expect.anything()
      );
    });

    it('still rejects an origin alert id in request_json that is oversized', async () => {
      await submitFileHandler()(
        createContext(),
        createFileRequest(JSON.stringify({ origin: { alert_ids: ['a'.repeat(129)] } })),
        mockResponse
      );

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: '`request_json` contains invalid options.' },
      });
      expect(client.submitFile).not.toHaveBeenCalled();
    });

    it('rejects an origin alert id in request_json the caller cannot read with 400', async () => {
      callerCanRead([]);

      await submitFileHandler()(
        createContext(),
        createFileRequest('{"origin":{"alert_ids":["alert-foreign"]}}'),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
      expect(client.submitFile).not.toHaveBeenCalled();
    });

    it.each([
      ['keeps a plain type/subtype', 'application/x-dosexec', 'application/x-dosexec'],
      ['drops parameters', 'text/plain; charset=utf-8', 'text/plain'],
      ['omits a value that is not a type/subtype', 'not a mime type', undefined],
      ['omits a value with no subtype', 'text', undefined],
      [
        'truncates an oversized type',
        `application/${'x'.repeat(300)}`,
        `application/${'x'.repeat(243)}`,
      ],
    ])('%s as the stored mime type', async (_name, contentType, expected) => {
      client.submitFile.mockResolvedValue({
        id: 'task-4',
        created_at: '2026-12-15T10:00:00.000Z',
        tags: ['space:default'],
        ...NO_ALERT_GROUPS,
      } as never);
      const sample = Object.assign(sampleStream('data'), {
        hapi: { headers: { 'content-type': contentType } },
      });
      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: DETONATE_SUBMIT_FILE_PATH,
        body: {
          sample_file: sample,
          sample_filename: 'sample.bin',
          request_json: '{"origin":{"source":"detonate_page"}}',
        },
      }) as never;

      await submitFileHandler()(createContext(), request, mockResponse);
      await flushWrites();

      const [[{ doc }]] = esClient.update.mock.calls;
      if (expected === undefined) {
        expect(doc).not.toHaveProperty(['file.mime_type']);
      } else {
        expect(doc['file.mime_type']).toBe(expected);
      }
    });

    it('rejects an alert tag in request_json the caller cannot read with 400', async () => {
      callerCanRead([]);

      await submitFileHandler()(
        createContext(),
        createFileRequest('{"tags":["alert:alert-foreign"]}'),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
      expect(client.submitFile).not.toHaveBeenCalled();
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

    it('answers 503 with a sandbox-unavailable message, not a generic 500, when the sandbox is down', async () => {
      client.getTask.mockRejectedValue(
        new Ctor('The detonation sandbox is unavailable: the service is unreachable (x).', 503)
      );

      await getTaskHandler()(
        createContext(),
        createRequest('get', `${DETONATE_TASKS_PATH}/task-1`, undefined, { taskId: 'task-1' }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 503,
        body: { message: expect.stringContaining('sandbox is unavailable') },
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

    it("records the run it read, without origin, and does not record another space's run", async () => {
      const task = {
        id: 'task-1',
        created_at: '2026-12-15T10:00:00.000Z',
        tags: ['space:team-a'],
        ...NO_ALERT_GROUPS,
      };
      client.getTask.mockResolvedValue(task as never);
      const request = createRequest('get', `${DETONATE_TASKS_PATH}/task-1`, undefined, {
        taskId: 'task-1',
      });

      await getTaskHandler()(createContext(), request, mockResponse);
      await flushWrites();

      expect(esClient.update).toHaveBeenCalledTimes(1);
      const [[{ index, doc }]] = esClient.update.mock.calls;
      expect(index).toBe('.kibana-detonate-results-team-a');
      expect(doc).toMatchObject({ 'detonate.space_id': 'team-a', 'detonate.task_id': 'task-1' });
      expect(doc).not.toHaveProperty(['detonate.source']);
      expect(doc).not.toHaveProperty(['detonate.submitter']);

      esClient.update.mockClear();
      client.getTask.mockResolvedValue({ id: 'task-2', tags: ['space:team-b'] } as never);
      await getTaskHandler()(createContext(), request, mockResponse);
      await flushWrites();
      expect(esClient.update).not.toHaveBeenCalled();
    });

    it('still returns the run when recording it fails', async () => {
      const task = { id: 'task-1', created_at: '2026-12-15T10:00:00.000Z', tags: ['space:team-a'] };
      client.getTask.mockResolvedValue(task as never);
      esClient.update.mockRejectedValue(new Error('es down'));

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

    it('records the run with its space, but the response carries no space or origin', async () => {
      client.getTask.mockResolvedValue(run as never);
      client.getTaskUpdates.mockResolvedValue([] as never);
      client.getTaskAlerts.mockResolvedValue([] as never);

      await recordHandler()(createContext(), recordRequest('run-1'), mockResponse);
      await flushWrites();

      expect(esClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          index: '.kibana-detonate-results-team-a',
          id: 'run-1',
          doc: expect.objectContaining({ 'detonate.space_id': 'team-a' }),
        }),
        { requestTimeout: 2000, maxRetries: 0 }
      );
      const [[{ body }]] = mockResponse.ok.mock.calls as unknown as Array<
        [{ body: Record<string, unknown> }]
      >;
      expect(body).not.toHaveProperty(['detonate.space_id']);
      expect(body).not.toHaveProperty(['detonate.source']);
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

  describe('runs stats', () => {
    const statsHandler = () =>
      router.versioned.getRoute('get', DETONATE_RUNS_STATS_PATH).versions['1'].handler;
    const statsQuerySchema = () => {
      const { config } = router.versioned.getRoute('get', DETONATE_RUNS_STATS_PATH).versions['1'];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      return (validation as { request: { query: { validate(q: unknown): unknown } } }).request
        .query;
    };
    const stats = (query: Record<string, unknown> = {}) =>
      statsHandler()(
        createContext(),
        httpServerMock.createKibanaRequest({
          method: 'get',
          path: DETONATE_RUNS_STATS_PATH,
          query: statsQuerySchema().validate({ from: 'now-30d', to: 'now', ...query }) as never,
        }),
        mockResponse
      );
    const searchArgs = () => esClient.search.mock.calls[0][0];

    beforeEach(() => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
      esClient.search.mockResolvedValue({
        hits: { total: { value: 3, relation: 'eq' }, hits: [] },
        aggregations: {
          verdicts: {
            buckets: [
              { key: 'malicious', doc_count: 2 },
              { key: 'unknown', doc_count: 1 },
            ],
          },
          mean_duration: { value: 90_000_000_000 },
          siem_alerts: { value: 4 },
          endpoint_alerts: { value: 7 },
          trend: {
            buckets: [
              {
                key: 1_700_000_000_000,
                doc_count: 3,
                verdicts: { buckets: [{ key: 'malicious', doc_count: 3 }] },
              },
            ],
          },
          top_rules: { buckets: [{ key: 'Rule A', doc_count: 2 }] },
          top_event_codes: { buckets: [{ key: 'malicious_file', doc_count: 5 }] },
        },
      });
    });

    it('requires bounded time strings, accepting ISO dates and date math, and bounds kql and search', () => {
      const schemaOf = statsQuerySchema();

      expect(schemaOf.validate({ from: 'now-30d', to: 'now' })).toEqual({
        from: 'now-30d',
        to: 'now',
      });
      expect(schemaOf.validate({ from: '2026-01-01T00:00:00.000Z', to: 'now/d' })).toEqual({
        from: '2026-01-01T00:00:00.000Z',
        to: 'now/d',
      });
      expect(() => schemaOf.validate({})).toThrow();
      expect(() => schemaOf.validate({ from: 'now-30d' })).toThrow();
      expect(() => schemaOf.validate({ from: 'not a date', to: 'now' })).toThrow(/date math/);
      expect(() => schemaOf.validate({ from: 'now', to: 'now+1x' })).toThrow();
      expect(() =>
        schemaOf.validate({ from: 'now-'.concat('1d'.repeat(40)), to: 'now' })
      ).toThrow();
      expect(() =>
        schemaOf.validate({ from: 'now-1d', to: 'now', kql: 'a'.repeat(1025) })
      ).toThrow();
      expect(() =>
        schemaOf.validate({ from: 'now-1d', to: 'now', search: 'a'.repeat(129) })
      ).toThrow();
    });

    it("aggregates this space's run documents inside the time range, with no hits", async () => {
      await stats({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' });

      const args = searchArgs();
      expect(args).toEqual(
        expect.objectContaining({
          index: '.kibana-detonate-results-team-a',
          ignore_unavailable: true,
          allow_no_indices: true,
          size: 0,
          track_total_hits: true,
        })
      );
      expect(args.query.bool.filter).toEqual([
        { term: { 'detonate.doc_kind': 'run' } },
        {
          range: {
            '@timestamp': {
              gte: Date.parse('2026-01-01T00:00:00.000Z'),
              lte: Date.parse('2026-01-31T00:00:00.000Z'),
              format: 'epoch_millis',
            },
          },
        },
      ]);
      expect(args.aggs.verdicts.terms).toEqual({
        field: 'detonate.verdict',
        missing: 'unknown',
        size: 4,
      });
      expect(args.aggs.mean_duration).toEqual({ avg: { field: 'event.duration' } });
      // The diagnostic-only side is not a detection.
      expect(args.aggs.siem_alerts).toEqual({
        sum: { field: 'detonate.alerts.production_detection' },
      });
      expect(args.aggs.endpoint_alerts).toEqual({
        sum: { field: 'detonate.alerts.production_endpoint' },
      });
      expect(JSON.stringify(args.aggs)).not.toContain('diagnostic_endpoint');
      expect(args.aggs.top_rules.terms).toEqual({
        field: 'detonate.detection_rule_names',
        size: 10,
      });
      expect(args.aggs.top_event_codes.terms).toEqual({
        field: 'detonate.endpoint_event_codes',
        size: 10,
      });
      expect(args.aggs.trend.date_histogram).toEqual({
        field: '@timestamp',
        fixed_interval: '1d',
        min_doc_count: 0,
        extended_bounds: {
          min: Date.parse('2026-01-01T00:00:00.000Z'),
          max: Date.parse('2026-01-31T00:00:00.000Z'),
        },
      });
      expect(args.aggs.trend.aggs.verdicts.terms.field).toBe('detonate.verdict');
    });

    it('applies the same KQL and search as the runs route, after the run-document pin', async () => {
      await stats({ kql: 'detonate.state: "running"', search: 'evil' });

      const { filter } = searchArgs().query.bool;
      expect(filter[0]).toEqual({ term: { 'detonate.doc_kind': 'run' } });
      expect(JSON.stringify(filter[1])).toContain('detonate.state');
      expect(JSON.stringify(filter[2])).toContain('file.name');
      expect(filter[3].range['@timestamp']).toBeDefined();
    });

    it('caps the trend at 120 buckets by widening the interval on a long range', async () => {
      await stats({ from: '2020-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' });

      const { date_histogram: histogram } = searchArgs().aggs.trend;
      const days = Number(histogram.fixed_interval.replace('d', ''));
      expect(days).toBeGreaterThan(1);
      const rangeDays = (Date.parse('2026-01-01') - Date.parse('2020-01-01')) / 86_400_000;
      // Two extra buckets: extended_bounds can add one at each edge.
      expect(Math.ceil(rangeDays / days) + 2).toBeLessThanOrEqual(120);
      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          trend: expect.objectContaining({ intervalMs: days * 86_400_000 }),
        }),
      });
    });

    it('shapes the aggregations: verdicts, ms duration, alert sums, trend and top terms', async () => {
      await stats();

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: {
          total: 3,
          verdicts: { malicious: 2, benign: 0, inconclusive: 0, unknown: 1 },
          meanDurationMs: 90_000,
          alerts: { siem: 4, endpoint: 7 },
          trend: {
            intervalMs: 86_400_000,
            buckets: [
              {
                key: 1_700_000_000_000,
                total: 3,
                verdicts: { malicious: 3, benign: 0, inconclusive: 0, unknown: 0 },
              },
            ],
          },
          topRules: [{ key: 'Rule A', count: 2 }],
          topEventCodes: [{ key: 'malicious_file', count: 5 }],
        },
      });
    });

    it('reports no mean duration when no run has one', async () => {
      esClient.search.mockResolvedValue({
        hits: { total: { value: 0, relation: 'eq' }, hits: [] },
        aggregations: { mean_duration: { value: null } },
      });

      await stats();

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({ total: 0, meanDurationMs: null }),
      });
    });

    it.each([
      ['an invalid KQL', { kql: 'detonate.state: (' }],
      ['a clause without a field', { kql: 'foo' }],
    ])('answers 400 for %s without querying', async (_name, query) => {
      await stats(query);

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: expect.stringContaining('Invalid KQL') },
      });
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('answers 400 for a range that ends before it starts', async () => {
      await stats({ from: 'now', to: 'now-1d' });

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: expect.stringContaining('from is after to') },
      });
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('answers an empty shape for a missing index', async () => {
      const { errors } = jest.requireActual<{
        errors: typeof import('@elastic/elasticsearch').errors;
      }>('@elastic/elasticsearch');
      esClient.search.mockRejectedValue(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'index_not_found_exception', reason: 'no such index' } },
          headers: {},
          meta: {},
          warnings: [],
        } as unknown as ConstructorParameters<typeof errors.ResponseError>[0])
      );

      await stats();

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: {
          total: 0,
          verdicts: { malicious: 0, benign: 0, inconclusive: 0, unknown: 0 },
          meanDurationMs: null,
          alerts: { siem: 0, endpoint: 0 },
          trend: { intervalMs: 86_400_000, buckets: [] },
          topRules: [],
          topEventCodes: [],
        },
      });
    });
  });

  describe('runs search', () => {
    const runsHandler = () =>
      router.versioned.getRoute('get', DETONATE_RUNS_PATH).versions['1'].handler;
    const runsQuerySchema = () => {
      const { config } = router.versioned.getRoute('get', DETONATE_RUNS_PATH).versions['1'];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      return (validation as { request: { query: { validate(q: unknown): unknown } } }).request
        .query;
    };
    const search = (query: Record<string, unknown> = {}) =>
      runsHandler()(
        createContext(),
        httpServerMock.createKibanaRequest({
          method: 'get',
          path: DETONATE_RUNS_PATH,
          query: runsQuerySchema().validate(query) as never,
        }),
        mockResponse
      );
    const searchArgs = () => esClient.search.mock.calls[0][0];

    beforeEach(() => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
      esClient.search.mockResolvedValue({
        hits: {
          total: { value: 2, relation: 'eq' },
          hits: [
            { _source: { 'detonate.task_id': 'a' } },
            { _source: { 'detonate.task_id': 'b' } },
          ],
        },
      });
    });

    it('bounds every parameter and rejects a sort field outside the allowlist', () => {
      const schemaOf = runsQuerySchema();

      expect(schemaOf.validate({})).toEqual({});
      expect(() => schemaOf.validate({ kql: 'a'.repeat(1025) })).toThrow();
      expect(() => schemaOf.validate({ search: 'a'.repeat(129) })).toThrow();
      expect(() => schemaOf.validate({ size: 101 })).toThrow();
      expect(() => schemaOf.validate({ size: 0 })).toThrow();
      expect(() => schemaOf.validate({ from: -1 })).toThrow();
      expect(() => schemaOf.validate({ from: 10001 })).toThrow();
      // The default page of 50 from 9951 would pass the window.
      expect(() => schemaOf.validate({ from: 9951 })).toThrow();
      expect(() => schemaOf.validate({ from: 9950, size: 100 })).toThrow();
      expect(schemaOf.validate({ from: 9900, size: 100 })).toEqual({ from: 9900, size: 100 });
      expect(schemaOf.validate({ from: 9950 })).toEqual({ from: 9950 });
      expect(() => schemaOf.validate({ sort_direction: 'sideways' })).toThrow();
      expect(() => schemaOf.validate({ sort_field: 'tags' })).toThrow();
      expect(() => schemaOf.validate({ sort_field: 'detonate.doc_kind' })).toThrow();
      DETONATION_RUNS_SORT_FIELDS.forEach((sortField) =>
        expect(schemaOf.validate({ sort_field: sortField })).toEqual({ sort_field: sortField })
      );
    });

    it("reads this space's results index as the internal user and returns the hits and total", async () => {
      await search();

      expect(searchArgs()).toEqual(
        expect.objectContaining({
          index: '.kibana-detonate-results-team-a',
          ignore_unavailable: true,
          allow_no_indices: true,
          track_total_hits: true,
          from: 0,
          size: 50,
        })
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { hits: [{ 'detonate.task_id': 'a' }, { 'detonate.task_id': 'b' }], total: 2 },
      });
    });

    it('always filters to run documents, with or without a KQL filter', async () => {
      const runTerm = { term: { 'detonate.doc_kind': 'run' } };

      await search({ kql: 'detonate.state: "running"' });
      const withKql = searchArgs().query.bool.filter;
      expect(withKql[0]).toEqual(runTerm);
      expect(JSON.stringify(withKql[1])).toContain('detonate.state');

      esClient.search.mockClear();
      await search();
      expect(searchArgs().query.bool.filter).toEqual([runTerm]);
    });

    it('sorts by the requested field, ties broken by task id', async () => {
      await search({ sort_field: 'detonate.alerts.total', sort_direction: 'asc' });

      expect(searchArgs().sort).toEqual([
        { 'detonate.alerts.total': { order: 'asc', unmapped_type: 'long' } },
        { 'detonate.task_id': { order: 'asc', unmapped_type: 'keyword' } },
      ]);
    });

    it('turns free text into escaped wildcard clauses over hash, name, tag and submitter', async () => {
      await search({ search: 'ev*il" OR x:y' });

      const { filter } = searchArgs().query.bool;
      expect(JSON.stringify(filter)).not.toContain('query_string');
      expect(filter[1].bool.should).toEqual(
        ['file.hash.sha256', 'file.name', 'tags', 'detonate.submitter'].map((field) => ({
          wildcard: { [field]: { value: '*ev\\*il" OR x:y*', case_insensitive: true } },
        }))
      );
    });

    it('searches tolerating a missing index and answers an empty list', async () => {
      esClient.search.mockResolvedValue({
        hits: { total: { value: 0, relation: 'eq' }, hits: [] },
      });

      await search();

      expect(searchArgs()).toEqual(
        expect.objectContaining({ ignore_unavailable: true, allow_no_indices: true })
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { hits: [], total: 0 } });
    });

    describe('when the search still rejects', () => {
      const responseError = (statusCode: number, type?: string) => {
        const { errors } = jest.requireActual<{
          errors: typeof import('@elastic/elasticsearch').errors;
        }>('@elastic/elasticsearch');
        return new errors.ResponseError({
          statusCode,
          body: type
            ? { error: { type, reason: 'boom', root_cause: [{ type, reason: 'boom root' }] } }
            : undefined,
          headers: {},
          meta: {},
          warnings: [],
        } as unknown as ConstructorParameters<typeof errors.ResponseError>[0]);
      };

      it('answers an empty list for an index_not_found_exception', async () => {
        esClient.search.mockRejectedValue(responseError(404, 'index_not_found_exception'));

        await search();

        expect(mockResponse.ok).toHaveBeenCalledWith({ body: { hits: [], total: 0 } });
      });

      it('answers 400 with the root-cause reason when Elasticsearch rejects the query', async () => {
        esClient.search.mockRejectedValue(responseError(400, 'search_phase_execution_exception'));

        await search({ kql: '@timestamp > "not-a-date"' });

        expect(mockResponse.ok).not.toHaveBeenCalled();
        expect(mockResponse.customError).not.toHaveBeenCalled();
        expect(mockResponse.badRequest).toHaveBeenCalledWith({
          body: { message: 'Invalid runs query: boom root' },
        });
      });

      it('answers 400 for a rejected free-text search too', async () => {
        esClient.search.mockRejectedValue(responseError(400, 'search_phase_execution_exception'));

        await search({ search: 'abc' });

        expect(mockResponse.badRequest).toHaveBeenCalledWith({
          body: { message: 'Invalid runs query: boom root' },
        });
      });

      it.each([[{ sort_field: '@timestamp' }], [{ kql: '   ', search: ' ' }]])(
        'does not blame the caller for a 400 on a request with no filter (%j)',
        async (query) => {
          esClient.search.mockRejectedValue(responseError(400, 'search_phase_execution_exception'));

          await search(query);

          expect(mockResponse.ok).not.toHaveBeenCalled();
          expect(mockResponse.badRequest).not.toHaveBeenCalled();
          expect(mockResponse.customError).toHaveBeenCalled();
        }
      );

      it('bounds the root-cause reason in the 400 message', async () => {
        const error = responseError(400, 'search_phase_execution_exception');
        (
          error.body as { error: { root_cause: Array<{ reason: string }> } }
        ).error.root_cause[0].reason = 'x'.repeat(1000);
        esClient.search.mockRejectedValue(error);

        await search({ kql: 'detonate.state: running' });

        expect(mockResponse.badRequest).toHaveBeenCalledWith({
          body: { message: `Invalid runs query: ${'x'.repeat(200)}` },
        });
      });

      it('rethrows a 5xx search failure unchanged', async () => {
        esClient.search.mockRejectedValue(responseError(503, 'search_phase_execution_exception'));

        await search({ kql: 'detonate.state: running' });

        expect(mockResponse.ok).not.toHaveBeenCalled();
        expect(mockResponse.badRequest).not.toHaveBeenCalled();
        expect(mockResponse.customError).toHaveBeenCalled();
      });

      it('does not treat another 404 type as a missing index', async () => {
        esClient.search.mockRejectedValue(responseError(404, 'resource_not_found_exception'));

        await search();

        expect(mockResponse.ok).not.toHaveBeenCalled();
      });

      it('does not treat a 404 without a body as a missing index', async () => {
        esClient.search.mockRejectedValue(responseError(404));

        await search();

        expect(mockResponse.ok).not.toHaveBeenCalled();
      });
    });

    it('answers 400 for a clause without a field, which would match every field', async () => {
      await search({ kql: 'foo' });
      await search({ kql: '*:foo' });
      await search({ kql: 'detonate.state: running and bar' });

      expect(mockResponse.badRequest).toHaveBeenCalledTimes(3);
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('answers 400 for KQL that parses but does not compile against the run fields', async () => {
      // Nested syntax on a flat field: fromKueryExpression accepts it, toElasticsearchQuery throws.
      await search({ kql: 'detonate.step:{ number: 1 }' });

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: {
          message: expect.stringContaining(
            'Invalid KQL: detonate.step.number is not a nested field'
          ),
        },
      });
      expect(mockResponse.customError).not.toHaveBeenCalled();
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('compiles a field clause against the run fields, not a query_string', async () => {
      await search({ kql: 'detonate.state: running and detonate.alerts.total > 2' });

      const { filter } = searchArgs().query.bool;
      expect(JSON.stringify(filter[1])).not.toContain('query_string');
      expect(JSON.stringify(filter[1])).toContain(
        '{"term":{"detonate.state":{"value":"running"}}}'
      );
    });

    describe('running runs', () => {
      const runningTask = {
        ...NO_ALERT_GROUPS,
        id: 'a',
        created_at: '2026-12-15T09:59:00.000Z',
        tags: ['space:team-a'],
      };
      const storedHit = (state: string, index = 0, timestamp = new Date().toISOString()) => ({
        'detonate.task_id': ['a', 'b'][index],
        'detonate.state': state,
        '@timestamp': timestamp,
      });
      const returnHits = (...states: string[]) =>
        esClient.search.mockResolvedValue({
          hits: {
            total: { value: states.length, relation: 'eq' },
            hits: states.map((state, index) => ({ _source: storedHit(state, index) })),
          },
        });
      const returnedHits = () =>
        (mockResponse.ok.mock.calls[0][0] as { body: { hits: Array<Record<string, unknown>> } })
          .body.hits;

      it('re-reads a running hit, returns it fresh and writes it through', async () => {
        returnHits('running');
        client.getTask.mockResolvedValue(runningTask as never);

        await search();

        expect(client.getTask).toHaveBeenCalledWith('a');
        expect(returnedHits()[0]).toEqual(
          expect.objectContaining({ 'detonate.task_id': 'a', 'detonate.state': 'complete' })
        );
        expect(esClient.update).toHaveBeenCalledTimes(1);
      });

      it('keeps the stored hit and still answers when the service fails', async () => {
        returnHits('running');
        client.getTask.mockRejectedValue(new Error('service down'));

        await search();

        expect(returnedHits()).toEqual([
          expect.objectContaining({ 'detonate.task_id': 'a', 'detonate.state': 'running' }),
        ]);
        expect(mockResponse.customError).not.toHaveBeenCalled();
      });

      it('keeps the submit-only fields the task does not carry when it refreshes a hit', async () => {
        esClient.search.mockResolvedValue({
          hits: {
            total: { value: 1, relation: 'eq' },
            hits: [
              {
                _source: {
                  ...storedHit('running'),
                  'detonate.source': 'file',
                  'detonate.submitter': 'analyst',
                },
              },
            ],
          },
        });
        client.getTask.mockResolvedValue(runningTask as never);

        await search();

        expect(returnedHits()[0]).toEqual(
          expect.objectContaining({
            'detonate.state': 'complete',
            'detonate.source': 'file',
            'detonate.submitter': 'analyst',
          })
        );
      });

      it('answers with the stored hit when the service never responds', async () => {
        jest.useFakeTimers();
        try {
          returnHits('running');
          client.getTask.mockReturnValue(new Promise(() => {}));

          const answered = search();
          await jest.advanceTimersByTimeAsync(3_500);
          await answered;

          expect(returnedHits()).toEqual([
            expect.objectContaining({ 'detonate.task_id': 'a', 'detonate.state': 'running' }),
          ]);
          expect(mockResponse.customError).not.toHaveBeenCalled();
        } finally {
          jest.useRealTimers();
        }
      });

      it('does not re-read a running hit older than any run can last', async () => {
        esClient.search.mockResolvedValue({
          hits: {
            total: { value: 1, relation: 'eq' },
            hits: [
              {
                _source: storedHit(
                  'running',
                  0,
                  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
                ),
              },
            ],
          },
        });

        await search();

        expect(client.getTask).not.toHaveBeenCalled();
        expect(returnedHits()[0]).toEqual(expect.objectContaining({ 'detonate.state': 'running' }));
      });

      it('keeps the stored hit of a run that has left this space', async () => {
        returnHits('running');
        client.getTask.mockResolvedValue({ ...runningTask, tags: ['space:team-b'] } as never);

        await search();

        expect(returnedHits()[0]).toEqual(
          storedHit('running', 0, returnedHits()[0]['@timestamp'] as string)
        );
        expect(esClient.update).not.toHaveBeenCalled();
      });

      it('does not re-read a run that is not running', async () => {
        returnHits('complete', 'failed');

        await search();

        expect(client.getTask).not.toHaveBeenCalled();
        expect(returnedHits()).toHaveLength(2);
      });
    });

    it('answers 400 for KQL that does not parse and never queries', async () => {
      await search({ kql: 'detonate.state: (' });

      expect(mockResponse.badRequest).toHaveBeenCalledTimes(1);
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('answers 500 when the results store fails', async () => {
      esClient.search.mockRejectedValue(new Error('es down'));

      await search();

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
    });
  });

  describe('prior-run handler', () => {
    const sha = 'a'.repeat(64);
    const searchReturns = (source?: Record<string, unknown>) =>
      esClient.search.mockResolvedValue({ hits: { hits: source ? [{ _source: source }] : [] } });

    it('answers known-malicious from an earlier malicious run in this space', async () => {
      searchReturns({
        'detonate.task_id': 'run-1',
        'detonate.verdict': 'malicious',
        '@timestamp': '2026-11-01T00:00:00Z',
      });

      await priorRunsHandler()(
        createContext(),
        createRequest('get', DETONATE_PRIOR_RUNS_PATH, undefined, { sha256: sha }),
        mockResponse
      );

      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ index: '.kibana-detonate-results-default' }),
        expect.anything()
      );
      expect(client.listTasks).not.toHaveBeenCalled();
      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: {
          sha256: sha,
          status: 'known-malicious',
          source: 'prior-detonation',
          last_task_id: 'run-1',
          last_verdict: 'malicious',
          last_seen: '2026-11-01T00:00:00Z',
        },
      });
    });

    it('answers `unknown` when there is no prior run — never benign', async () => {
      searchReturns();

      await priorRunsHandler()(
        createContext(),
        createRequest('get', DETONATE_PRIOR_RUNS_PATH, undefined, { sha256: 'b'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { sha256: 'b'.repeat(64), status: 'unknown', source: 'prior-detonation' },
      });
    });

    it('shapes a read failure through the shared error response', async () => {
      esClient.search.mockRejectedValue(new Error('es down'));

      await priorRunsHandler()(
        createContext(),
        createRequest('get', DETONATE_PRIOR_RUNS_PATH, undefined, { sha256: 'c'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.ok).not.toHaveBeenCalled();
      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
    });
  });

  describe('alert decisions', () => {
    const decisionsHandler = () =>
      router.versioned.getRoute('post', DETONATE_DECISIONS_PATH).versions['1'].handler;
    const outcomesHandler = () =>
      router.versioned.getRoute('post', DETONATE_ALERT_OUTCOMES_PATH).versions['1'].handler;
    const bodySchema = (path: string) => {
      const { config } = router.versioned.getRoute('post', path).versions['1'];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      if (!validation || !validation.request) {
        throw new Error('route registered without request validation');
      }
      return validation.request.body as { validate(body: unknown): unknown };
    };
    const decision = (overrides: Record<string, unknown> = {}) => ({
      alert_id: 'alert-1',
      state: 'verdict_applied',
      verdict: 'malicious',
      task_id: 'task-1',
      ...overrides,
    });

    beforeEach(() => {
      register({ canWrite: true });
      esClient.bulk.mockResolvedValue({ errors: false, items: [] });
    });

    it('writes the decisions into the space results index as the internal user', async () => {
      scopedCanRead(['alert-1']);

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, { decisions: [decision()] }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { written: 1 } });
      const [[{ operations }]] = esClient.bulk.mock.calls;
      expect(operations[0]).toEqual({
        update: {
          _index: '.kibana-detonate-results-default',
          _id: 'alert-1',
          retry_on_conflict: 3,
        },
      });
      expect(operations[1].upsert).toEqual(
        expect.objectContaining({
          'detonate.doc_kind': 'alert_decision',
          'detonate.decision.state': 'verdict_applied',
          'detonate.verdict': 'malicious',
        })
      );
      expect(esClient.updateByQuery).not.toHaveBeenCalled();
    });

    it('writes one document per alert when a batch repeats an id, the last decision winning', async () => {
      scopedCanRead(['alert-1']);

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, {
          decisions: [decision({ verdict: 'benign' }), decision({ verdict: 'malicious' })],
        }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { written: 1 } });
      const [[{ operations }]] = esClient.bulk.mock.calls;
      expect(operations).toHaveLength(2);
      expect(operations[1].upsert['detonate.verdict']).toBe('malicious');
    });

    it('checks readability through the scoped client, never the origin-only context client', async () => {
      scopedCanRead(['alert-1']);

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, { decisions: [decision()] }),
        mockResponse
      );

      expect(scopedSearch).toHaveBeenCalledTimes(1);
      expect(callerSearch).not.toHaveBeenCalled();
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { written: 1 } });
    });

    it('takes the space from the request path, never from the body', async () => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-b');
      scopedCanRead(['alert-1']);

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, { decisions: [decision()] }),
        mockResponse
      );

      const [[{ operations }]] = esClient.bulk.mock.calls;
      expect(operations[0].update._index).toBe('.kibana-detonate-results-team-b');
      expect(scopedSearch).toHaveBeenCalledWith(
        expect.objectContaining({ index: expect.stringContaining('team-b') })
      );
    });

    it('rejects an alert the caller cannot read with 403 and writes nothing', async () => {
      scopedCanRead(['alert-1']);

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, {
          decisions: [decision(), decision({ alert_id: 'alert-hidden' })],
        }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          body: { message: expect.stringContaining('alert-hidden') },
        })
      );
      expect(esClient.bulk).not.toHaveBeenCalled();
      expect(esClient.indices.putMapping).not.toHaveBeenCalled();
    });

    it('fails the request without writing when the results mapping cannot be updated', async () => {
      scopedCanRead(['alert-1']);
      esClient.indices.putMapping.mockRejectedValue(new Error('mapping update refused'));

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, { decisions: [decision()] }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
      expect(mockResponse.ok).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    it('fails the request when the bulk write reports an item error', async () => {
      scopedCanRead(['alert-1']);
      esClient.bulk.mockResolvedValue({
        errors: true,
        items: [{ update: { _id: 'alert-1', error: { type: 'mapper_exception', reason: 'x' } } }],
      });

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, { decisions: [decision()] }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
      expect(mockResponse.ok).not.toHaveBeenCalled();
    });

    it('ensures the results mapping before it writes', async () => {
      scopedCanRead(['alert-1']);

      await decisionsHandler()(
        createContext(),
        createRequest('post', DETONATE_DECISIONS_PATH, { decisions: [decision()] }),
        mockResponse
      );

      expect(esClient.indices.putMapping).toHaveBeenCalledWith(
        expect.objectContaining({ index: '.kibana-detonate-results-default' }),
        expect.anything()
      );
      expect(esClient.indices.putMapping.mock.invocationCallOrder[0]).toBeLessThan(
        esClient.bulk.mock.invocationCallOrder[0]
      );
    });

    it.each([
      ['no decisions', { decisions: [] }],
      ['too many decisions', { decisions: Array.from({ length: 101 }, () => decision()) }],
      ['an unknown state', { decisions: [decision({ state: 'noted_quiet' })] }],
      ['an unknown verdict', { decisions: [decision({ verdict: 'safe' })] }],
      ['an empty alert id', { decisions: [decision({ alert_id: '' })] }],
      ['an oversized alert id', { decisions: [decision({ alert_id: 'a'.repeat(129) })] }],
      ['an oversized task id', { decisions: [decision({ task_id: 't'.repeat(129) })] }],
      ['an oversized execution id', { decisions: [decision({ execution_id: 'e'.repeat(129) })] }],
      ['an oversized hash', { decisions: [decision({ sha256: 'a'.repeat(65) })] }],
      [
        'a 64-character hash that is not hexadecimal',
        { decisions: [decision({ sha256: 'z'.repeat(64) })] },
      ],
      ['a short hash', { decisions: [decision({ sha256: 'a'.repeat(63) })] }],
      [
        'a verdict_applied decision without a verdict',
        { decisions: [decision({ verdict: undefined })] },
      ],
      ['an oversized reason', { decisions: [decision({ reason: 'r'.repeat(257) })] }],
    ])('rejects a decisions body with %s', (_name, body) => {
      expect(() => bodySchema(DETONATE_DECISIONS_PATH).validate(body)).toThrow();
    });

    it('accepts a hexadecimal hash of either case, and states other than verdict_applied without a verdict', () => {
      expect(() =>
        bodySchema(DETONATE_DECISIONS_PATH).validate({
          decisions: [
            decision({ sha256: HASH_A.toUpperCase() }),
            decision({ state: 'released', verdict: undefined }),
          ],
        })
      ).not.toThrow();
    });

    it('accepts every decision state', () => {
      for (const state of [
        'queued',
        'running',
        'released',
        'verdict_applied',
        'known_malicious',
        'skipped',
        'not_eligible',
      ]) {
        expect(() =>
          bodySchema(DETONATE_DECISIONS_PATH).validate({ decisions: [decision({ state })] })
        ).not.toThrow();
      }
    });

    it.each([
      ['no ids', { alert_ids: [] }],
      ['too many ids', { alert_ids: Array.from({ length: 201 }, (_, i) => `a-${i}`) }],
      ['an oversized id', { alert_ids: ['a'.repeat(129)] }],
      ['an empty body', {}],
      ['empty alerts', { alerts: [] }],
      [
        'too many alerts',
        { alerts: Array.from({ length: 201 }, (_, i) => ({ alert_id: `a-${i}` })) },
      ],
      [
        'too many entries across both forms',
        {
          alert_ids: Array.from({ length: 100 }, (_, i) => `a-${i}`),
          alerts: Array.from({ length: 101 }, (_, i) => ({ alert_id: `b-${i}` })),
        },
      ],
      ['an alert without an id', { alerts: [{ sha256: HASH_A }] }],
      ['an unbounded hash', { alerts: [{ alert_id: 'a', sha256: 'a'.repeat(257) }] }],
      ['a hash that is not a string', { alerts: [{ alert_id: 'a', sha256: [HASH_A] }] }],
    ])('rejects an outcomes body with %s', (_name, body) => {
      expect(() => bodySchema(DETONATE_ALERT_OUTCOMES_PATH).validate(body)).toThrow();
    });

    it('accepts alerts with and without a hash', () => {
      expect(() =>
        bodySchema(DETONATE_ALERT_OUTCOMES_PATH).validate({
          alerts: [{ alert_id: 'a', sha256: HASH_A }, { alert_id: 'b' }],
        })
      ).not.toThrow();
    });

    it('lets a finished run of a sibling alert with the same hash cover the alert', async () => {
      esClient.mget.mockResolvedValue({ docs: [{ _id: 'sibling', found: false }] });
      esClient.search.mockResolvedValue({
        aggregations: {
          by_alert: { buckets: [] },
          by_hash: {
            buckets: [
              {
                key: HASH_A,
                completed: {
                  doc_count: 1,
                  latest: {
                    hits: {
                      hits: [
                        { _source: { 'detonate.verdict': 'malicious', 'detonate.task_id': 't-1' } },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      });

      await outcomesHandler()(
        createContext(),
        createRequest('post', DETONATE_ALERT_OUTCOMES_PATH, {
          alerts: [{ alert_id: 'sibling', sha256: HASH_A.toUpperCase() }],
        }),
        mockResponse
      );

      const [[searchRequest]] = esClient.search.mock.calls;
      expect(searchRequest.aggs?.by_hash).toEqual(
        expect.objectContaining({
          terms: expect.objectContaining({ field: 'file.hash.sha256', include: [HASH_A] }),
        })
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: {
          outcomes: { sibling: { state: 'completed', verdict: 'malicious', task_id: 't-1' } },
        },
      });
    });

    it('drops a malformed hash and keeps its alert id-only, without failing the batch', async () => {
      esClient.mget.mockResolvedValue({ docs: [] });
      esClient.search.mockResolvedValue({
        aggregations: { by_alert: { buckets: [] }, by_hash: { buckets: [] } },
      });
      const body = {
        alerts: [
          { alert_id: 'not-hex', sha256: 'z'.repeat(64) },
          { alert_id: 'too-short', sha256: HASH_A.slice(1) },
          { alert_id: 'too-long', sha256: `${HASH_A}a` },
          { alert_id: 'list-like', sha256: `${HASH_A},${HASH_B}` },
          { alert_id: 'empty', sha256: '' },
          { alert_id: 'valid', sha256: HASH_A.toUpperCase() },
        ],
      };

      expect(() => bodySchema(DETONATE_ALERT_OUTCOMES_PATH).validate(body)).not.toThrow();
      await outcomesHandler()(
        createContext(),
        createRequest('post', DETONATE_ALERT_OUTCOMES_PATH, body),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalled();
      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(esClient.mget).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ['not-hex', 'too-short', 'too-long', 'list-like', 'empty', 'valid'],
        }),
        expect.anything()
      );
      const [[searchRequest]] = esClient.search.mock.calls;
      expect(searchRequest.aggs?.by_hash).toEqual(
        expect.objectContaining({
          terms: expect.objectContaining({ include: [HASH_A] }),
        })
      );
    });

    it('queries no hash when the body carries ids only', async () => {
      esClient.mget.mockResolvedValue({ docs: [] });
      esClient.search.mockResolvedValue({
        aggregations: { by_alert: { buckets: [] }, by_hash: { buckets: [] } },
      });

      await outcomesHandler()(
        createContext(),
        createRequest('post', DETONATE_ALERT_OUTCOMES_PATH, { alert_ids: ['alert-1'] }),
        mockResponse
      );

      const [[searchRequest]] = esClient.search.mock.calls;
      expect(searchRequest.aggs?.by_hash).toEqual(
        expect.objectContaining({ terms: expect.objectContaining({ include: [] }) })
      );
    });

    it('reports outcomes as an object keyed by alert id', async () => {
      esClient.mget.mockResolvedValue({
        docs: [
          {
            _id: 'alert-1',
            found: true,
            _source: {
              'detonate.doc_kind': 'alert_decision',
              'detonate.decision.state': 'skipped',
              '@timestamp': '2026-12-15T09:00:00.000Z',
            },
          },
          { _id: 'alert-2', found: false },
        ],
      });
      esClient.search.mockResolvedValue({
        aggregations: { by_alert: { buckets: [] }, by_hash: { buckets: [] } },
      });

      await outcomesHandler()(
        createContext(),
        createRequest('post', DETONATE_ALERT_OUTCOMES_PATH, { alert_ids: ['alert-1', 'alert-2'] }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { outcomes: { 'alert-1': { state: 'skipped' } } },
      });
      expect(esClient.mget).toHaveBeenCalledWith(
        expect.objectContaining({ index: '.kibana-detonate-results-default' }),
        expect.anything()
      );
    });

    it('does not run the alert-readability check on the read route', async () => {
      esClient.mget.mockResolvedValue({ docs: [] });
      esClient.search.mockResolvedValue({
        aggregations: { by_alert: { buckets: [] }, by_hash: { buckets: [] } },
      });

      await outcomesHandler()(
        createContext(),
        createRequest('post', DETONATE_ALERT_OUTCOMES_PATH, { alert_ids: ['alert-1'] }),
        mockResponse
      );

      expect(callerSearch).not.toHaveBeenCalled();
    });

    it('answers 500 when the outcomes read fails', async () => {
      esClient.mget.mockRejectedValue(new Error('cluster down'));
      esClient.search.mockResolvedValue({});

      await outcomesHandler()(
        createContext(),
        createRequest('post', DETONATE_ALERT_OUTCOMES_PATH, { alert_ids: ['alert-1'] }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
    });

    it('opens both routes to the write tier only', () => {
      const security = {
        authz: {
          requiredPrivileges: [
            { anyRequired: ['securitySolution-detonateAll', 'alertzero_write'] },
          ],
        },
      };
      for (const path of [DETONATE_DECISIONS_PATH, DETONATE_ALERT_OUTCOMES_PATH]) {
        const config = router.versioned.post.mock.calls.find(([c]) => c.path === path)?.[0];
        expect(config?.security).toEqual(security);
      }
    });
  });

  describe('sweep candidates', () => {
    const sweepHandler = () =>
      router.versioned.getRoute('post', DETONATE_SWEEP_CANDIDATES_PATH).versions['1'].handler;
    const sweepSchema = () => {
      const { config } = router.versioned.getRoute('post', DETONATE_SWEEP_CANDIDATES_PATH).versions[
        '1'
      ];
      const validation =
        typeof config.validate === 'function' ? config.validate() : config.validate;
      if (!validation || !validation.request) {
        throw new Error('route registered without request validation');
      }
      return validation.request.body as { validate(body: unknown): unknown };
    };

    it('reads the alerts as the caller and the results as the internal user', async () => {
      scopedSearch.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'alert-1',
              sort: [1, 'alert-1'],
              fields: { 'file.hash.sha256': [HASH_A] },
            },
          ],
        },
      });
      esClient.mget.mockResolvedValue({ docs: [{ _id: 'alert-1', found: false }] });
      esClient.search.mockResolvedValue({
        aggregations: { by_alert: { buckets: [] }, by_hash: { buckets: [] } },
      });

      await sweepHandler()(
        createContext(),
        createRequest('post', DETONATE_SWEEP_CANDIDATES_PATH, { limit: 20 }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { values: [['alert-1', HASH_A]], scanned: 1, truncated: false },
      });
      expect(scopedSearch).toHaveBeenCalledTimes(1);
      expect(callerSearch).not.toHaveBeenCalled();
    });

    it('answers 403 when the caller cannot read the alerts', async () => {
      scopedSearch.mockRejectedValue({ statusCode: 403 });

      await sweepHandler()(
        createContext(),
        createRequest('post', DETONATE_SWEEP_CANDIDATES_PATH, { limit: 20 }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('defaults the limit and accepts the severity subset', () => {
      expect(sweepSchema().validate({})).toEqual({ limit: 20 });
      expect(sweepSchema().validate({ limit: 200, severities: ['high', 'critical'] })).toEqual({
        limit: 200,
        severities: ['high', 'critical'],
      });
    });

    it.each([
      ['a zero limit', { limit: 0 }],
      ['a limit past the page size', { limit: 201 }],
      ['a fractional limit', { limit: 2.5 }],
      ['an unknown severity', { severities: ['urgent'] }],
      ['an empty severity list', { severities: [] }],
      ['too many severities', { severities: ['low', 'medium', 'high', 'critical', 'high'] }],
    ])('rejects %s', (_label, body) => {
      expect(() => sweepSchema().validate(body)).toThrow();
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

    const runHit = (
      id: string,
      alertId: string | undefined,
      extra: { origin?: string[]; sha256?: string } = {}
    ) => ({
      _id: id,
      sort: ['2026-01-01T00:00:00.000Z', id],
      _source: {
        ...(alertId ? { detonate: { alert_id: alertId } } : {}),
        'detonate.origin.alert_ids': extra.origin ?? (alertId ? [alertId] : []),
        file: { hash: { sha256: extra.sha256 ?? `hash-${id}` } },
      },
    });
    /** The candidate search first, then the collapsed newest-run-per-alert search. */
    const serveRuns = (candidates: unknown[], newest: Array<[alertId: string, runId: string]>) =>
      esClient.search.mockImplementation((async (request: { collapse?: unknown }) =>
        request.collapse
          ? {
              hits: {
                hits: newest.map(([alertId, runId]) => ({
                  _id: runId,
                  fields: { 'detonate.alert_id': [alertId] },
                })),
              },
            }
          : { hits: { hits: candidates } }) as never);
    const handoffIds = () => {
      const [[{ body }]] = mockResponse.ok.mock.calls as unknown as Array<
        [{ body: { handoffs: Array<{ task_id: string }> } }]
      >;
      return body.handoffs.map(({ task_id: taskId }) => taskId);
    };
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

    it('opens the list route only to the Detonate privilege or AlertZero write', () => {
      const [[config]] = router.versioned.get.mock.calls.filter(
        ([registered]) => registered.path === DETONATE_HANDOFFS_PATH
      );

      expect(config.security).toEqual({
        authz: {
          requiredPrivileges: [
            { anyRequired: ['securitySolution-detonateAll', 'alertzero_write'] },
          ],
        },
      });
    });

    it("lists from this space's results index, oldest first, by the hunt selector", async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      const [[searchRequest]] = esClient.search.mock.calls;
      expect(searchRequest.index).toBe('.kibana-detonate-results-default');
      expect(searchRequest.size).toBe(20);
      expect(searchRequest.sort).toEqual([
        { '@timestamp': { order: 'asc', unmapped_type: 'date' } },
        { 'detonate.task_id': 'asc' },
      ]);
      expect(searchRequest.query).toEqual({
        bool: {
          must_not: [{ term: { 'detonate.doc_kind': 'alert_decision' } }],
          filter: [
            { exists: { field: 'file.hash.sha256' } },
            { exists: { field: 'detonate.origin.alert_ids' } },
            {
              bool: {
                minimum_should_match: 1,
                should: [
                  { term: { 'detonate.handoff.hunt': 'requested' } },
                  {
                    bool: {
                      filter: [{ term: { 'detonate.verdict': 'malicious' } }],
                      must_not: [{ terms: { 'detonate.handoff.hunt': ['done'] } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      });
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { handoffs: [] } });
    });

    it('never reads the alerts index', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('coverage'), mockResponse);

      const indices = esClient.search.mock.calls.map(([request]) => String(request.index));
      expect(indices.filter((index) => index.includes('.alerts-'))).toEqual([]);
    });

    it('selects the coverage fields for the Detection Worker', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('coverage'), mockResponse);

      const selector = JSON.stringify(esClient.search.mock.calls[0][0].query);
      expect(selector).toContain('"detonate.handoff.coverage":"requested"');
      expect(selector).toContain('"detonate.handoff.coverage":["done","reviewed"]');
      expect(selector).not.toContain('detonate.handoff.hunt');
    });

    // A run whose rule-creation copy is parked is in progress; the sweep skips it.
    // It must be excluded from the search itself, or in-progress runs would
    // consume the candidate window and hide a valid handoff behind them.
    it('excludes runs with a parked rule-creation copy from the coverage search', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('coverage'), mockResponse);

      expect(esClient.search.mock.calls[0][0].query.bool.must_not).toContainEqual({
        term: { 'detonate.handoff.coverage': 'in_progress' },
      });
    });

    it('keeps the hunt search free of the coverage lock', async () => {
      esClient.search.mockResolvedValue({ hits: { hits: [] } });

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(JSON.stringify(esClient.search.mock.calls[0][0].query)).not.toContain('in_progress');
    });

    // An explicit request is its own clause: the done exclusion sits only on the
    // malicious clause, so a re-request beats an earlier done.
    it.each([['hunt'], ['coverage']] as const)(
      'lets a %s request win over a done marker',
      async (kind) => {
        esClient.search.mockResolvedValue({ hits: { hits: [] } });

        await listHandler()(createContext(), listRequest(kind), mockResponse);

        const [requested, malicious] =
          esClient.search.mock.calls[0][0].query.bool.filter[2].bool.should;
        expect(requested).toEqual({ term: { [`detonate.handoff.${kind}`]: 'requested' } });
        expect(malicious.bool.must_not).toHaveLength(1);
      }
    );

    it('accepts only the two Worker kinds', () => {
      expect(querySchema().validate({ marker: 'hunt' })).toEqual({ marker: 'hunt' });
      expect(() => querySchema().validate({ marker: 'detonate:malicious' })).toThrow();
      expect(() => querySchema().validate({})).toThrow();
    });

    it('returns each run with its alerts and hash', async () => {
      serveRuns(
        [runHit('run-1', 'a-1', { origin: ['a-2'] }), runHit('run-2', 'a-3')],
        [
          ['a-1', 'run-1'],
          ['a-3', 'run-2'],
        ]
      );

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: {
          handoffs: [
            { task_id: 'run-1', sha256: 'hash-run-1', alert_ids: ['a-1', 'a-2'] },
            { task_id: 'run-2', sha256: 'hash-run-2', alert_ids: ['a-3'] },
          ],
        },
      });
    });

    it('asks for the newest run of the candidate alerts only, collapsed per alert', async () => {
      serveRuns([runHit('run-1', 'a-1')], [['a-1', 'run-1']]);

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      const [, [newestRequest]] = esClient.search.mock.calls;
      expect(newestRequest.index).toBe('.kibana-detonate-results-default');
      expect(newestRequest.collapse).toEqual({ field: 'detonate.alert_id' });
      expect(newestRequest.sort).toEqual([
        { '@timestamp': { order: 'desc', unmapped_type: 'date' } },
      ]);
      expect(newestRequest.query.bool.filter).toEqual([
        { terms: { 'detonate.alert_id': ['a-1'] } },
      ]);
      expect(newestRequest.query.bool.must_not).toEqual([
        { term: { 'detonate.doc_kind': 'alert_decision' } },
      ]);
    });

    it('drops an older malicious run whose alert has a newer run', async () => {
      serveRuns(
        [runHit('run-old', 'a-1'), runHit('run-other', 'a-2')],
        [
          ['a-1', 'run-new'],
          ['a-2', 'run-other'],
        ]
      );

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(handoffIds()).toEqual(['run-other']);
    });

    it('skips the newest-run search when no candidate names an alert', async () => {
      serveRuns([runHit('run-1', undefined, { origin: ['a-1'] })], []);

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(esClient.search).toHaveBeenCalledTimes(1);
      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { handoffs: [{ task_id: 'run-1', sha256: 'hash-run-1', alert_ids: ['a-1'] }] },
      });
    });

    it('keeps a run no alert started when the newest-run filter drops a stale alert run', async () => {
      serveRuns(
        [
          runHit('run-origin-only', undefined, { origin: ['a-9'] }),
          runHit('run-stale', 'a-1'),
          runHit('run-current', 'a-2'),
        ],
        [
          ['a-1', 'run-newer'],
          ['a-2', 'run-current'],
        ]
      );

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(esClient.search).toHaveBeenCalledTimes(2);
      expect(handoffIds()).toEqual(['run-origin-only', 'run-current']);
    });

    it('returns at most five runs', async () => {
      const ids = Array.from({ length: 8 }, (_, i) => `a-${i}`);
      serveRuns(
        ids.map((id) => runHit(`run-${id}`, id)),
        ids.map((id) => [id, `run-${id}`] as [string, string])
      );

      await listHandler()(createContext(), listRequest('hunt'), mockResponse);

      expect(handoffIds()).toEqual(['run-a-0', 'run-a-1', 'run-a-2', 'run-a-3', 'run-a-4']);
    });

    describe('when superseded runs fill the oldest pages', () => {
      const pageOf = (prefix: string, count: number) =>
        Array.from({ length: count }, (_, i) => runHit(`${prefix}-${i}`, `${prefix}-alert-${i}`));
      /** Candidate pages, each requested with the last sort values of the one before; every alert's newest run is `current` unless named in `superseded`. */
      const servePages = (
        pages: Array<Array<ReturnType<typeof runHit>>>,
        supersededPrefix: string
      ) =>
        esClient.search.mockImplementation((async (request: {
          collapse?: unknown;
          search_after?: unknown[];
          query: { bool: { filter: Array<{ terms: { 'detonate.alert_id': string[] } }> } };
        }) => {
          if (!request.collapse) {
            const { search_after: after } = request;
            const page = after
              ? pages.findIndex((hits) => hits[hits.length - 1]?.sort?.[1] === after[1]) + 1
              : 0;
            return { hits: { hits: (after && page === 0 ? [] : pages[page]) ?? [] } };
          }
          const alertIds = request.query.bool.filter[0].terms['detonate.alert_id'];
          return {
            hits: {
              hits: alertIds.map((alertId) => ({
                _id: alertId.startsWith(supersededPrefix)
                  ? `newer-${alertId}`
                  : alertId.replace('-alert-', '-'),
                fields: { 'detonate.alert_id': [alertId] },
              })),
            },
          };
        }) as never);
      const candidateSearches = () =>
        esClient.search.mock.calls.filter(([request]) => !request.collapse);

      it('reads the next page when a full page holds only superseded runs', async () => {
        servePages([pageOf('old', 20), pageOf('cur', 3)], 'old');

        await listHandler()(createContext(), listRequest('hunt'), mockResponse);

        expect(handoffIds()).toEqual(['cur-0', 'cur-1', 'cur-2']);
        expect(candidateSearches()).toHaveLength(2);
      });

      it('pages past runs that share a timestamp by the last hit’s sort values', async () => {
        const tied = (id: string) => ({
          ...runHit(id, id.replace('-', '-alert-')),
          sort: ['2026-02-02T00:00:00.000Z', id],
        });
        servePages([pageOf('old', 19).concat(tied('tie-a')), [tied('tie-b')]], 'old');

        await listHandler()(createContext(), listRequest('hunt'), mockResponse);

        expect(handoffIds()).toEqual(['tie-a', 'tie-b']);
        const [first, second] = candidateSearches().map(([request]) => request);
        expect(first).not.toHaveProperty('search_after');
        expect(second.search_after).toEqual(['2026-02-02T00:00:00.000Z', 'tie-a']);
        expect(second).not.toHaveProperty('from');
      });

      it('gives up after five pages instead of paging without bound', async () => {
        servePages(
          Array.from({ length: 8 }, (_, page) => pageOf(`old${page}`, 20)),
          'old'
        );

        await listHandler()(createContext(), listRequest('hunt'), mockResponse);

        expect(candidateSearches()).toHaveLength(5);
        expect(mockResponse.ok).toHaveBeenCalledWith({ body: { handoffs: [] } });
      });

      it('stops paging once five current runs are in hand', async () => {
        servePages([pageOf('old', 15).concat(pageOf('cur', 5)), pageOf('cur2', 20)], 'old');

        await listHandler()(createContext(), listRequest('hunt'), mockResponse);

        expect(handoffIds()).toEqual(['cur-0', 'cur-1', 'cur-2', 'cur-3', 'cur-4']);
        expect(candidateSearches()).toHaveLength(1);
      });
    });

    it("rewrites the markers on the run's own results document", async () => {
      esClient.update.mockResolvedValue({ result: 'updated' });

      await setHandler()(
        createContext(),
        setRequest('run-1', { add: ['detonate:hunt-done'], remove: ['detonate:hunt-requested'] }),
        mockResponse
      );

      const [[update]] = esClient.update.mock.calls;
      expect(update.index).toBe('.kibana-detonate-results-default');
      expect(update.id).toBe('run-1');
      expect(update.refresh).toBe(true);
      expect(update.script.params).toEqual({
        add: [{ field: 'detonate.handoff.hunt', value: 'done' }],
        remove: [{ field: 'detonate.handoff.hunt', value: 'requested' }],
      });
      expect(update.script.source).not.toContain('detonate:');
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { updated: 1 } });
    });

    it('turns a re-request into a remove of done and an add of requested', async () => {
      esClient.update.mockResolvedValue({ result: 'updated' });

      await setHandler()(
        createContext(),
        setRequest('run-1', { add: ['detonate:hunt-requested'], remove: ['detonate:hunt-done'] }),
        mockResponse
      );

      expect(esClient.update.mock.calls[0][0].script.params).toEqual({
        add: [{ field: 'detonate.handoff.hunt', value: 'requested' }],
        remove: [{ field: 'detonate.handoff.hunt', value: 'done' }],
      });
    });

    it('never writes to the alerts index', async () => {
      esClient.update.mockResolvedValue({ result: 'updated' });

      await setHandler()(
        createContext(),
        setRequest('run-1', { add: ['detonate:coverage-in-progress'] }),
        mockResponse
      );

      expect(esClient.updateByQuery).not.toHaveBeenCalled();
      expect(esClient.update.mock.calls.map(([request]) => request.index)).toEqual([
        '.kibana-detonate-results-default',
      ]);
    });

    it('answers 404 when the run has no document in this space', async () => {
      const { errors } = jest.requireActual<{
        errors: typeof import('@elastic/elasticsearch').errors;
      }>('@elastic/elasticsearch');
      esClient.update.mockRejectedValue(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'document_missing_exception', reason: 'missing' } },
          headers: {},
          meta: {},
          warnings: [],
        } as unknown as ConstructorParameters<typeof errors.ResponseError>[0])
      );

      await setHandler()(
        createContext(),
        setRequest('run-1', { add: ['detonate:hunt-done'] }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 404,
        body: { message: 'No results document for this run in this space.' },
      });
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
          warnings: [],
          meta: {} as never,
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
          warnings: [],
          meta: {} as never,
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

  describe('behavior diff', () => {
    const DIFF_PATH = `${DETONATE_RUNS_PATH}/{id}/diff`;
    const diffHandler = () => router.versioned.getRoute('get', DIFF_PATH).versions['1'].handler;
    const diffRequest = (id: string, against?: string) =>
      httpServerMock.createKibanaRequest({
        method: 'get',
        path: `${DETONATE_RUNS_PATH}/${id}/diff`,
        ...(against ? { query: { against } } : {}),
        params: { id },
      });

    /** A completed run of `sha-a` in this space, submitted at the given minute. */
    const run = (
      id: string,
      createdAt = '2026-11-01T00:00:00.000Z',
      worker = 'detonate.workers.make_summary'
    ) => ({
      id,
      created_at: createdAt,
      tags: ['space:team-a'],
      last_worker_name: worker,
      last_worker_status: 'success',
      sample_hash: 'SHA-A',
      production_endpoint_alerts_count: 2,
      production_endpoint_alert_groups: [],
      diagnostic_endpoint_alerts_count: 0,
      diagnostic_endpoint_alert_groups: [],
      production_detection_alerts_count: 0,
      production_detection_alert_groups: [],
    });
    const alert = (eventId: string, timestamp = '2026-11-01T00:01:00.000Z') => ({
      '@timestamp': timestamp,
      event: { id: eventId, kind: 'alert' },
      host: { name: 'sandbox-host-secret-name', os: { type: 'linux' } },
    });
    /** ES|QL `STATS COUNT(*) BY event.category` rows for one run. */
    const countsRows = (rows: Array<[number, string | null]>) =>
      rows.map((row) => (row[1] === null ? [row[0], null] : row));

    /** The results index's answer to "newest earlier completed run of this hash". */
    const baselineIs = (taskId?: string) =>
      esClient.search.mockResolvedValue({
        hits: {
          hits: taskId
            ? [
                {
                  _source: { 'detonate.task_id': taskId, '@timestamp': '2026-11-01T00:00:00.000Z' },
                },
              ]
            : [],
        },
      });

    beforeEach(() => {
      endpointAppContextService.getActiveSpaceId.mockReturnValue('team-a');
      client.getTaskAlerts.mockResolvedValue([]);
      client.getTaskProcessEvents.mockResolvedValue([]);
      esClient.bulk.mockResolvedValue({ items: [] });
    });

    const okBody = () => {
      const [[{ body }]] = mockResponse.ok.mock.calls as unknown as Array<
        [{ body: Record<string, unknown> }]
      >;
      return body;
    };

    it('diffs against the most recent earlier completed run of the same hash', async () => {
      client.getTask.mockImplementation(
        async (id: string) =>
          run(id, id === 'run-2' ? '2026-11-02T00:00:00.000Z' : '2026-11-01T00:00:00.000Z') as never
      );
      baselineIs('run-1');
      client.getTaskAlerts.mockResolvedValue([alert('e-1')]);
      esClient.esql.query
        .mockResolvedValueOnce({
          values: countsRows([
            [9, 'process'],
            [3, null],
          ]),
        })
        .mockResolvedValueOnce({
          values: countsRows([
            [2, 'process'],
            [1, 'file'],
          ]),
        });

      await diffHandler()(createContext(), diffRequest('run-2'), mockResponse);

      // Both runs' telemetry is copied into the stream before the diff, and
      // the stream is refreshed so the ES|QL below sees this request's own
      // copies (bulk's default refresh interval would hide them for seconds).
      expect(client.getTaskAlerts).toHaveBeenCalledWith(
        'run-2',
        'production-endpoint-alerts',
        expect.anything()
      );
      expect(client.getTaskAlerts).toHaveBeenCalledWith(
        'run-1',
        'production-endpoint-alerts',
        expect.anything()
      );
      expect(esClient.indices.refresh).toHaveBeenCalledWith({
        index: '.kibana-detonate-sandbox-team-a',
      });
      expect(okBody()).toEqual({
        task_id: 'run-2',
        against_task_id: 'run-1',
        comparable: true,
        current: {
          task_id: 'run-2',
          verdict: expect.any(String),
          categories: [
            { category: 'process', count: 9 },
            { category: 'uncategorized', count: 3 },
          ],
        },
        prior: {
          task_id: 'run-1',
          verdict: expect.any(String),
          categories: [
            { category: 'file', count: 1 },
            { category: 'process', count: 2 },
          ],
        },
        delta: [
          { category: 'process', current: 9, prior: 2, delta: 7 },
          { category: 'uncategorized', current: 3, prior: 0, delta: 3 },
          { category: 'file', current: 0, prior: 1, delta: -1 },
        ],
      });
    });

    it('answers the null shape when the hash has no earlier completed run', async () => {
      client.getTask.mockResolvedValue(run('run-0', '2026-10-31T00:00:00.000Z') as never);
      baselineIs();

      await diffHandler()(createContext(), diffRequest('run-0'), mockResponse);

      expect(okBody()).toEqual({ task_id: 'run-0', reason: 'no-prior-run' });
      // Nothing copied: there is nothing to diff against.
      expect(esClient.bulk).not.toHaveBeenCalled();
      expect(esClient.esql.query).not.toHaveBeenCalled();
    });

    it('looks for a completed run no later than this one, excluding itself', async () => {
      client.getTask.mockResolvedValue(run('run-1', '2026-11-01T00:00:00.000Z') as never);
      baselineIs();

      await diffHandler()(createContext(), diffRequest('run-1'), mockResponse);

      const [[params]] = esClient.search.mock.calls;
      expect(params.index).toBe('.kibana-detonate-results-team-a');
      expect(params.query.bool.filter).toEqual(
        expect.arrayContaining([
          { term: { 'file.hash.sha256': 'sha-a' } },
          { term: { 'detonate.state': 'complete' } },
          { range: { '@timestamp': { lte: '2026-11-01T00:00:00.000Z' } } },
        ])
      );
      expect(params.query.bool.must_not).toEqual([{ term: { 'detonate.task_id': 'run-1' } }]);
    });

    it('falls back to an older baseline run when the newest is gone from the service', async () => {
      const { DetonateServiceError: Ctor } = jest.requireActual<{
        DetonateServiceError: typeof DetonateServiceError;
      }>('../client');
      client.getTask.mockImplementation(async (id: string) => {
        if (id === 'run-1') throw new Ctor('The detonation service answered 404.', 404);
        return run(
          id,
          id === 'run-2' ? '2026-11-02T00:00:00.000Z' : '2026-10-31T00:00:00.000Z'
        ) as never;
      });
      // Newest baseline 404s in the service; the next one still exists.
      esClient.search
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: { 'detonate.task_id': 'run-1', '@timestamp': '2026-11-01T00:00:00.000Z' },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: { 'detonate.task_id': 'run-0', '@timestamp': '2026-10-31T00:00:00.000Z' },
              },
            ],
          },
        });
      esClient.esql.query
        .mockResolvedValueOnce({ values: countsRows([[9, 'process']]) })
        .mockResolvedValueOnce({ values: countsRows([[2, 'process']]) });

      await diffHandler()(createContext(), diffRequest('run-2'), mockResponse);

      expect(okBody()).toMatchObject({
        task_id: 'run-2',
        against_task_id: 'run-0',
        comparable: true,
      });
      // The dropped newest baseline was excluded from the retry.
      const retryParams = esClient.search.mock.calls[1][0] as {
        query: { bool: { must_not: unknown[] } };
      };
      expect(retryParams.query.bool.must_not).toEqual([
        { term: { 'detonate.task_id': 'run-2' } },
        { term: { 'detonate.task_id': 'run-1' } },
      ]);
    });

    it('answers the null shape when the baseline run is gone from the service', async () => {
      const { DetonateServiceError: Ctor } = jest.requireActual<{
        DetonateServiceError: typeof DetonateServiceError;
      }>('../client');
      client.getTask.mockImplementation(async (id: string) => {
        if (id === 'run-1') throw new Ctor('The detonation service answered 404.', 404);
        return run('run-2', '2026-11-02T00:00:00.000Z') as never;
      });
      baselineIs('run-1');

      await diffHandler()(createContext(), diffRequest('run-2'), mockResponse);

      expect(okBody()).toEqual({ task_id: 'run-2', reason: 'no-prior-run' });
    });

    it('diffs a caller-chosen against, flagged not comparable across samples', async () => {
      client.getTask.mockImplementation(async (id: string) =>
        id === 'run-2'
          ? (run('run-2', '2026-11-02T00:00:00.000Z') as never)
          : ({ ...run('run-9'), sample_hash: 'SHA-B' } as never)
      );
      esClient.esql.query
        .mockResolvedValueOnce({ values: countsRows([[9, 'process']]) })
        .mockResolvedValueOnce({ values: countsRows([[2, 'process']]) });

      await diffHandler()(createContext(), diffRequest('run-2', 'run-9'), mockResponse);

      expect(okBody()).toMatchObject({
        against_task_id: 'run-9',
        comparable: false,
        delta: [{ category: 'process', current: 9, prior: 2, delta: 7 }],
      });
    });

    it('treats a missing sandbox stream as an empty side, not a failure', async () => {
      const { errors } = jest.requireActual<{
        errors: typeof import('@elastic/elasticsearch').errors;
      }>('@elastic/elasticsearch');
      client.getTask.mockImplementation(
        async (id: string) =>
          run(id, id === 'run-2' ? '2026-11-02T00:00:00.000Z' : '2026-11-01T00:00:00.000Z') as never
      );
      baselineIs('run-1');
      esClient.esql.query
        .mockRejectedValueOnce(
          new errors.ResponseError({
            body: {
              error: {
                type: 'verification_exception',
                reason: 'Unknown index [.kibana-detonate-sandbox-team-a]',
                root_cause: [
                  {
                    type: 'verification_exception',
                    reason: 'Unknown index [.kibana-detonate-sandbox-team-a]',
                  },
                ],
              },
            },
            statusCode: 400,
            headers: {},
            warnings: [],
            meta: {} as never,
          })
        )
        .mockResolvedValueOnce({ values: countsRows([[2, 'process']]) });

      await diffHandler()(createContext(), diffRequest('run-2'), mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      expect(okBody()).toMatchObject({
        current: { categories: [] },
        delta: [{ category: 'process', current: 0, prior: 2, delta: -2 }],
      });
    });

    it('rejects a read-only analyst before any copy', async () => {
      register({ canWrite: false });

      await diffHandler()(createContext(), diffRequest('run-2'), mockResponse);

      expect(mockResponse.forbidden).toHaveBeenCalled();
      expect(client.getTask).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    it("answers 404 for another space's run", async () => {
      client.getTask.mockResolvedValue({
        ...run('run-2', '2026-11-02T00:00:00.000Z'),
        tags: ['space:team-b'],
      } as never);

      await diffHandler()(createContext(), diffRequest('run-2'), mockResponse);

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
      expect(esClient.esql.query).not.toHaveBeenCalled();
    });
  });

  describe('results writes never block the answer', () => {
    const task = {
      id: 'task-1',
      created_at: '2026-12-15T10:00:00.000Z',
      tags: ['space:default', 'alert:alert-1'],
      ...NO_ALERT_GROUPS,
    };

    const taskRequest = () =>
      createRequest('get', `${DETONATE_TASKS_PATH}/task-1`, undefined, { taskId: 'task-1' });

    const fileRequest = () =>
      httpServerMock.createKibanaRequest({
        method: 'post',
        path: DETONATE_SUBMIT_FILE_PATH,
        body: {
          sample_file: Readable.from([Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR')]),
          sample_filename: 'sample.txt',
        },
      }) as never;

    it.each([
      [
        'submit-hash',
        () =>
          submitHashHandler()(
            createContext(),
            createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
              sample_hash: 'a'.repeat(64),
              tags: ['alert:alert-1'],
            }),
            mockResponse
          ),
      ],
      ['submit-file', () => submitFileHandler()(createContext(), fileRequest(), mockResponse)],
      ['poll', () => getTaskHandler()(createContext(), taskRequest(), mockResponse)],
      [
        'record',
        () =>
          recordHandler()(
            createContext(),
            createRequest('get', `${DETONATE_RUNS_PATH}/task-1/record`, undefined, {
              id: 'task-1',
            }),
            mockResponse
          ),
      ],
    ])('%s answers without waiting for a write that never completes', async (_name, call) => {
      callerCanRead(['alert-1']);
      client.submitHash.mockResolvedValue(task as never);
      client.submitFile.mockResolvedValue(task as never);
      client.getTask.mockResolvedValue(task as never);
      client.getTaskUpdates.mockResolvedValue([] as never);
      client.getTaskAlerts.mockResolvedValue([] as never);
      esClient.update.mockReturnValue(new Promise(() => {}));

      await call();
      await flushWrites();

      expect(esClient.update).toHaveBeenCalledTimes(1);
      expect(mockResponse.ok).toHaveBeenCalledTimes(1);
      expect(mockResponse.customError).not.toHaveBeenCalled();
    });
  });
});
