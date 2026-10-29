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
  DETONATE_REPUTATION_PATH,
  DETONATE_TASKS_PATH,
} from '../../../common/detonate_prototype';
import type { DetonateClient, DetonateServiceError } from '../client';
import { registerDetonatePrototypeRoutes } from '.';

describe('registerDetonatePrototypeRoutes', () => {
  let router: RouterMock;
  let mockResponse: ReturnType<typeof httpServerMock.createResponseFactory>;
  let client: jest.Mocked<DetonateClient>;
  let endpointAppContextService: {
    getCurrentUsername: jest.Mock;
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

  const listTasksHandler = () =>
    router.versioned.getRoute('get', DETONATE_TASKS_PATH).versions['1'].handler;

  const alertTasksHandler = () =>
    router.versioned.getRoute('get', `${DETONATE_TASKS_PATH}/alert/{alertId}`).versions['1']
      .handler;

  const reputationHandler = () =>
    router.versioned.getRoute('get', `${DETONATE_REPUTATION_PATH}/{sha256}`).versions['1'].handler;

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
      getCurrentUsername: jest.fn().mockReturnValue('analyst-test'),
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
      reputation: jest.fn(),
      submitFile: jest.fn(),
      submitHash: jest.fn(),
      getTask: jest.fn(),
      getTaskUpdates: jest.fn(),
      listTasks: jest.fn(),
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
      client.submitHash.mockResolvedValue({ task: { id: 'task-1' }, deduplicated: false } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.forbidden).toHaveBeenCalledWith(forbiddenBody);
      expect(client.submitHash).not.toHaveBeenCalled();
    });

    it('asks for write access, not read, before submitting', async () => {
      client.submitHash.mockResolvedValue({ task: { id: 'task-1' }, deduplicated: false } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(hasDetonatePrivilege).toHaveBeenCalledWith(expect.anything(), 'write');
    });

    it('opens every route to either Security Solution access or the Detonate privilege', () => {
      const securityConfigs = [
        ...router.versioned.get.mock.calls.map(([config]) => config.security),
        ...router.versioned.post.mock.calls.map(([config]) => config.security),
      ];

      expect(securityConfigs.length).toBeGreaterThan(0);
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
      client.submitFile.mockResolvedValue({ task: { id: 'task-2' }, deduplicated: false } as never);

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
      client.submitHash.mockResolvedValue({ task, deduplicated: false } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(client.submitHash).toHaveBeenCalledWith(
        { sample_hash: 'a'.repeat(64), tags: ['space:default'] },
        'analyst-test' // the authenticated Kibana user, as the quota key
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { ...task, deduplicated: false } });
    });

    it('marks a deduplicated submit so the caller can say "existing report"', async () => {
      const task = { id: 'task-existing', tags: ['space:default'] };
      client.submitHash.mockResolvedValue({ task, deduplicated: true } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: { ...task, deduplicated: true },
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
      client.submitFile.mockResolvedValue({ task, deduplicated: false } as never);

      await submitFileHandler()(
        createContext(),
        createFileRequest('{"tags":["demo"]}'),
        mockResponse
      );

      expect(client.submitFile).toHaveBeenCalledWith(
        { tags: ['demo', 'space:default'], sample_filename: 'sample.txt' },
        expect.objectContaining({ filename: 'sample.txt' }),
        'analyst-test'
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { ...task, deduplicated: false } });
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
      client.submitHash.mockResolvedValue({
        task: { id: 'task-1', tags: ['space:team-a'] },
        deduplicated: false,
      } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, {
          sample_hash: 'a'.repeat(64),
          tags: ['demo', 'space:team-b'],
        }),
        mockResponse
      );

      expect(client.submitHash).toHaveBeenCalledWith(
        { sample_hash: 'a'.repeat(64), tags: ['demo', 'space:team-a'] },
        'analyst-test'
      );
    });

    it('resubmits fresh when the deduplicated report belongs to another space', async () => {
      const fresh = { id: 'task-fresh', tags: ['space:team-a'] };
      client.submitHash
        .mockResolvedValueOnce({
          task: { id: 'task-foreign', tags: ['space:team-b'] },
          deduplicated: true,
        } as never)
        .mockResolvedValueOnce({ task: fresh, deduplicated: false } as never);

      await submitHashHandler()(
        createContext(),
        createRequest('post', DETONATE_SUBMIT_HASH_PATH, { sample_hash: 'a'.repeat(64) }),
        mockResponse
      );

      expect(client.submitHash).toHaveBeenLastCalledWith(
        { sample_hash: 'a'.repeat(64), tags: ['space:team-a'], force_fresh: true },
        'analyst-test'
      );
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: { ...fresh, deduplicated: false } });
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

    it('filters the run list to the active space', async () => {
      client.listTasks.mockResolvedValue({ total: 0, offset: 0, size: 20, tasks: [] } as never);

      await listTasksHandler()(
        createContext(),
        httpServerMock.createKibanaRequest({
          method: 'get',
          path: DETONATE_TASKS_PATH,
          query: { query_string: 'abc' },
        }),
        mockResponse
      );

      expect(client.listTasks).toHaveBeenCalledWith({ query_string: 'abc', tag: 'space:team-a' });
    });

    it('filters the runs of one alert to the active space', async () => {
      client.listTasks.mockResolvedValue({ total: 0, offset: 0, size: 20, tasks: [] } as never);

      await alertTasksHandler()(
        createContext(),
        createRequest('get', `${DETONATE_TASKS_PATH}/alert/alert-1`, undefined, {
          alertId: 'alert-1',
        }),
        mockResponse
      );

      expect(client.listTasks).toHaveBeenCalledWith({ alert_id: 'alert-1', tag: 'space:team-a' });
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

  describe('reputation handler', () => {
    const known = {
      sha256: 'a'.repeat(64),
      status: 'known-malicious',
      source: 'detonate-seed',
      malware_family: 'eicar-test-file',
    };

    it('proxies the gate answer for a known-malicious digest', async () => {
      client.reputation.mockResolvedValue(known as never);

      await reputationHandler()(
        createContext(),
        createRequest('get', DETONATE_REPUTATION_PATH, undefined, { sha256: 'a'.repeat(64) }),
        mockResponse
      );

      expect(client.reputation).toHaveBeenCalledWith('a'.repeat(64));
      expect(mockResponse.ok).toHaveBeenCalledWith({ body: known });
    });

    it('passes `unknown` through untouched — never shaped into benign', async () => {
      const unknown = { sha256: 'b'.repeat(64), status: 'unknown', source: 'detonate-seed' };
      client.reputation.mockResolvedValue(unknown as never);

      await reputationHandler()(
        createContext(),
        createRequest('get', DETONATE_REPUTATION_PATH, undefined, { sha256: 'b'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({ body: unknown });
    });

    it('shapes a service error with the service status', async () => {
      const { DetonateServiceError: Ctor } = jest.requireActual<{
        DetonateServiceError: typeof DetonateServiceError;
      }>('../client');
      client.reputation.mockRejectedValue(new Ctor('The detonation service answered 503.', 503));

      await reputationHandler()(
        createContext(),
        createRequest('get', DETONATE_REPUTATION_PATH, undefined, { sha256: 'c'.repeat(64) }),
        mockResponse
      );

      expect(mockResponse.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 503 })
      );
    });
  });
});
