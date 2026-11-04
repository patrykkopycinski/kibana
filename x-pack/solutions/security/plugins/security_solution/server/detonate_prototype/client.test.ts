/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';

import type { DetonateTask } from '../../common/detonate_prototype';
import { createDetonateClient, DetonateServiceError } from './client';

const TOKEN = 'enrollment-token-must-not-leak';

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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('createDetonateClient', () => {
  let fetchMock: jest.SpyInstance;

  const client = (apiKey?: string) =>
    createDetonateClient({
      baseUrl: 'http://localhost:8787/',
      apiKey,
      requestTimeoutMs: 1_000,
      logger: loggerMock.create(),
    });

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('enrollment token redaction', () => {
    it('strips the token from a submitted task', async () => {
      fetchMock.mockResolvedValue(jsonResponse(rawTask()));

      const task = await client().submitHash({ sample_hash: 'a'.repeat(64) });

      expect(task.id).toBe('task-1');
      expect(task).not.toHaveProperty('agent_fleet_enrollment_token');
    });

    it('strips the token from a read task', async () => {
      fetchMock.mockResolvedValue(jsonResponse(rawTask()));

      expect(await client().getTask('task-1')).not.toHaveProperty('agent_fleet_enrollment_token');
    });

    it('strips the token from every task in the updates timeline', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse([
          { task: rawTask(), timestamp: '2026-11-01T10:00:00.000Z' },
          { task: rawTask(), timestamp: '2026-11-01T10:01:00.000Z' },
        ])
      );

      const updates = await client().getTaskUpdates('task-1');

      expect(JSON.stringify(updates)).not.toContain(TOKEN);
    });

    it('strips the token from every task in a search page', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          tasks: [rawTask(), rawTask({ id: 'task-2' })],
          query_string: '',
          offset: 0,
          size: 10,
          order: 'desc',
        })
      );

      const page = await client().listTasks();

      expect(page.tasks.map(({ id }) => id)).toEqual(['task-1', 'task-2']);
      expect(JSON.stringify(page)).not.toContain(TOKEN);
    });
  });

  describe('Auth header', () => {
    it('sends the gateway Auth header when a key is configured', async () => {
      fetchMock.mockResolvedValue(jsonResponse(rawTask()));

      await client('secret-key').getTask('task-1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8787/v1/detonate/tasks/task-1');
      expect(init.headers).toEqual({ Auth: 'secret-key' });
    });

    it('sends no Auth header when no key is configured', async () => {
      fetchMock.mockResolvedValue(jsonResponse(rawTask()));

      await client().getTask('task-1');

      expect(fetchMock.mock.calls[0][1].headers).toEqual({});
    });

    it('keeps the Auth header alongside request headers', async () => {
      fetchMock.mockResolvedValue(jsonResponse(rawTask()));

      await client('secret-key').submitHash({ sample_hash: 'a'.repeat(64) });

      expect(fetchMock.mock.calls[0][1].headers).toEqual({
        Auth: 'secret-key',
        'content-type': 'application/json',
      });
    });
  });

  describe('task search', () => {
    it('searches one sample by quoted, lowercased hash, newest first', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ tasks: [], query_string: '', offset: 0, size: 5, order: 'desc' })
      );

      await client().findTasksByHash('A'.repeat(64), 5);

      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.pathname).toBe('/v1/detonate/tasks');
      expect(url.searchParams.get('query_string')).toBe(`sample_hash:"${'a'.repeat(64)}"`);
      expect(url.searchParams.get('size')).toBe('5');
      expect(url.searchParams.get('order')).toBe('desc');
    });
  });

  describe('alert reads', () => {
    it('reads one alert kind for a task, passing the limit through', async () => {
      fetchMock.mockResolvedValue(jsonResponse([{ '@timestamp': '2026-01-01T00:00:00Z' }]));

      const docs = await client().getTaskAlerts('task/1', 'diagnostic-endpoint-alerts', 250);

      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.pathname).toBe('/v1/detonate/tasks/task%2F1/diagnostic-endpoint-alerts');
      expect(url.searchParams.get('limit')).toBe('250');
      expect(docs).toHaveLength(1);
    });

    it('leaves the limit to the service when none is given', async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));

      await client().getTaskAlerts('task-1', 'production-detection-alerts');

      expect(new URL(fetchMock.mock.calls[0][0]).search).toBe('');
    });
  });

  describe('errors', () => {
    it('passes a 404 through so callers can tell "not yet indexed" from an outage', async () => {
      fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));

      await expect(client().getTask('missing')).rejects.toMatchObject({
        name: 'DetonateServiceError',
        statusCode: 404,
      });
    });

    it('collapses an unexpected service status to 502', async () => {
      fetchMock.mockResolvedValue(new Response('boom', { status: 503 }));

      await expect(client().getTask('task-1')).rejects.toMatchObject({ statusCode: 502 });
    });

    it('reports an unreachable service as 502 without leaking the URL', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const error = await client()
        .getTask('task-1')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DetonateServiceError);
      expect((error as DetonateServiceError).statusCode).toBe(502);
      expect((error as DetonateServiceError).message).not.toContain('localhost');
    });
  });
});
