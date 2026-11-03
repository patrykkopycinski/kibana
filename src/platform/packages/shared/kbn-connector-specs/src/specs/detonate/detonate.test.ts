/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { getConnectorSpec } from '../../..';
import { Detonate } from './detonate';

const BASE_URL = 'https://detonate.example.com';
const API = `${BASE_URL}/v1/detonate`;
const SHA256 = 'a'.repeat(64);
const TOKEN = 'enrollment-secret';

const httpError = (status: number, data: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });

const task = (id: string) => ({
  id,
  sample_hash: SHA256,
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  agent_fleet_enrollment_token: TOKEN,
});

describe('Detonate', () => {
  const mockClient = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const mockContext = {
    client: mockClient,
    config: { url: `${BASE_URL}/` },
    log: { debug: jest.fn(), error: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is discoverable via getConnectorSpec', () => {
    const spec = getConnectorSpec('.detonate');
    expect(spec).toBe(Detonate);
    expect(Object.keys(spec?.actions ?? {}).sort()).toEqual([
      'findTasksByHash',
      'getTask',
      'getTaskAlertGroups',
      'getTaskAlerts',
      'getTaskLog',
      'getTaskMeta',
      'getTaskUpdates',
      'healthcheck',
      'listTasks',
      'meta',
      'submitCommands',
      'submitFile',
      'submitHash',
      'submitUrl',
    ]);
  });

  it('authenticates with the gateway Auth header', () => {
    expect(Detonate.metadata.minimumLicense).toBe('enterprise');
    expect(Detonate.metadata.isTechnicalPreview).toBe(true);
    expect(Detonate.metadata.supportedFeatureIds).toEqual(['workflows']);
    expect(Detonate.test?.enabled).toBe(true);
    expect(Detonate.auth?.types).toEqual([
      { type: 'api_key_header', isRecommended: true, defaults: { headerField: 'Auth' } },
    ]);
    expect(Object.values(Detonate.actions).every((action) => action.isTool === false)).toBe(true);
  });

  describe('input schemas', () => {
    it('accepts only the service OS families', () => {
      const { input } = Detonate.actions.submitHash;
      expect(input.safeParse({ sample_hash: SHA256, vm_os_family: 'darwin' }).success).toBe(true);
      expect(input.safeParse({ sample_hash: SHA256, vm_os_family: 'macos' }).success).toBe(false);
    });

    it('bounds tags and caps observation at the sandbox lifetime', () => {
      const { input } = Detonate.actions.submitHash;
      expect(input.safeParse({ sample_hash: SHA256, exec_wait_secs: 901 }).success).toBe(false);
      expect(
        input.safeParse({ sample_hash: SHA256, tags: Array.from({ length: 33 }, () => 'x') })
          .success
      ).toBe(false);
      expect(input.safeParse({ sample_hash: SHA256, tags: ['alert:1'] }).success).toBe(true);
    });

    it('requires at least one command for submitCommands', () => {
      const { input } = Detonate.actions.submitCommands;
      expect(input.safeParse({ exec_commands: [] }).success).toBe(false);
      expect(input.safeParse({ exec_commands: ['whoami'] }).success).toBe(true);
    });

    it('rejects a hash lookup with a non-SHA-256 value', () => {
      const { input } = Detonate.actions.findTasksByHash;
      expect(input.safeParse({ sha256: 'abc' }).success).toBe(false);
      expect(input.safeParse({ sha256: SHA256 }).success).toBe(true);
    });
  });

  describe('submit actions', () => {
    it('posts submitHash as JSON and redacts the enrollment token', async () => {
      mockClient.post.mockResolvedValue({ data: task('t-1') });

      const result = await Detonate.actions.submitHash.handler(mockContext, {
        sample_hash: SHA256,
        tags: ['alert:1'],
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        `${API}/submit-hash`,
        { sample_hash: SHA256, tags: ['alert:1'] },
        { headers: { 'Content-Type': 'application/json' } }
      );
      expect(result).toEqual({
        id: 't-1',
        sample_hash: SHA256,
        last_worker_name: 'detonate.workers.make_summary',
        last_worker_status: 'success',
      });
    });

    it.each([
      ['submitUrl', '/submit-url', { sample_url: 'https://samples.example.com/a.exe' }],
      ['submitCommands', '/submit-commands', { exec_commands: ['whoami'] }],
    ] as const)('posts %s to %s', async (action, path, input) => {
      mockClient.post.mockResolvedValue({ data: task('t-3') });

      const result = await Detonate.actions[action].handler(mockContext, input);

      expect(mockClient.post).toHaveBeenCalledWith(`${API}${path}`, input, {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).not.toHaveProperty('agent_fleet_enrollment_token');
    });

    it('puts the status code and FastAPI validation detail in the error message', async () => {
      mockClient.post.mockRejectedValue(
        httpError(422, { detail: [{ loc: ['body', 'sample_hash'], msg: 'Field required' }] })
      );

      await expect(
        Detonate.actions.submitHash.handler(mockContext, { sample_hash: SHA256 })
      ).rejects.toThrow(/^Detonate submitHash failed \(status 422\): .*Field required/);
    });

    it('decodes the sample and sends the service multipart fields', async () => {
      mockClient.post.mockResolvedValue({ data: task('t-2') });
      const bytes = Buffer.from('MZ sample bytes');

      const result = await Detonate.actions.submitFile.handler(mockContext, {
        file: bytes.toString('base64'),
        filename: 'sample.exe',
        tags: ['alert:2'],
      });

      const [url, form] = mockClient.post.mock.calls[0];
      expect(url).toBe(`${API}/submit-file`);
      expect(form).toBeInstanceOf(FormData);
      expect(JSON.parse((form as FormData).get('request_json') as string)).toEqual({
        tags: ['alert:2'],
      });
      const sample = (form as FormData).get('sample_file') as File;
      expect(sample.name).toBe('sample.exe');
      expect(Buffer.from(await sample.arrayBuffer()).equals(bytes)).toBe(true);
      expect(result).not.toHaveProperty('agent_fleet_enrollment_token');
    });
  });

  describe('read actions', () => {
    it('reads a task with an encoded id and redacts the token', async () => {
      mockClient.get.mockResolvedValue({ data: task('t/1') });

      const result = await Detonate.actions.getTask.handler(mockContext, { taskId: 't/1' });

      expect(mockClient.get).toHaveBeenCalledWith(`${API}/tasks/t%2F1`, undefined);
      expect(result).not.toHaveProperty('agent_fleet_enrollment_token');
      expect(result).toHaveProperty('id', 't/1');
    });

    it('redacts the token inside every task update', async () => {
      mockClient.get.mockResolvedValue({
        data: [{ task: task('t-1'), timestamp: '2026-11-03T10:00:00Z' }],
      });

      const result = await Detonate.actions.getTaskUpdates.handler(mockContext, {
        taskId: 't-1',
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${API}/tasks/t-1/updates`, undefined);
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      expect(result).toEqual({
        updates: [{ task: expect.objectContaining({ id: 't-1' }), timestamp: expect.any(String) }],
      });
    });

    it('reports a not-yet-indexed task as a 404 in the message', async () => {
      mockClient.get.mockRejectedValue(httpError(404, { detail: 'Task not found' }));

      await expect(
        Detonate.actions.getTask.handler(mockContext, { taskId: 'fresh' })
      ).rejects.toThrow('Detonate getTask failed (status 404): Task not found');
    });

    it('passes only real list parameters and redacts every listed task', async () => {
      mockClient.get.mockResolvedValue({
        data: { tasks: [task('t-1'), task('t-2')], offset: 0, size: 20, order: 'desc' },
      });

      const result = await Detonate.actions.listTasks.handler(mockContext, {
        query_string: 'tags:"space:default"',
        size: 20,
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${API}/tasks`, {
        params: { query_string: 'tags:"space:default"', size: 20 },
      });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('finds earlier runs of a sample with a sample_hash query', async () => {
      mockClient.get.mockResolvedValue({
        data: { tasks: [task('t-1')], offset: 0, size: 10, order: 'desc' },
      });

      const result = await Detonate.actions.findTasksByHash.handler(mockContext, {
        sha256: SHA256.toUpperCase(),
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${API}/tasks`, {
        params: { query_string: `sample_hash:${SHA256}`, size: 10, order: 'desc' },
      });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('reads task metadata and service metadata', async () => {
      mockClient.get.mockResolvedValue({ data: {} });

      await Detonate.actions.getTaskMeta.handler(mockContext, { taskId: 't-1' });
      await Detonate.actions.meta.handler(mockContext, {});

      expect(mockClient.get).toHaveBeenNthCalledWith(1, `${API}/tasks/t-1/meta`, undefined);
      expect(mockClient.get).toHaveBeenNthCalledWith(2, `${API}/meta`, undefined);
    });

    it.each([
      ['production_endpoint', 'production-endpoint-alerts'],
      ['diagnostic_endpoint', 'diagnostic-endpoint-alerts'],
      ['production_detection', 'production-detection-alerts'],
    ] as const)('maps the %s alert source to its endpoint', async (source, path) => {
      mockClient.get.mockResolvedValue({ data: [] });

      await Detonate.actions.getTaskAlerts.handler(mockContext, {
        taskId: 't-1',
        source,
        limit: 50,
      });
      await Detonate.actions.getTaskAlertGroups.handler(mockContext, { taskId: 't-1', source });

      expect(mockClient.get).toHaveBeenNthCalledWith(1, `${API}/tasks/t-1/${path}`, {
        params: { limit: 50 },
      });
      expect(mockClient.get).toHaveBeenNthCalledWith(2, `${API}/tasks/t-1/${path}/groups`, {
        params: {},
      });
    });

    it('reads a log as text and truncates oversized output', async () => {
      mockClient.get.mockResolvedValue({ data: 'x'.repeat(200_001) });

      const result = (await Detonate.actions.getTaskLog.handler(mockContext, {
        taskId: 't-1',
        logType: 'exec',
      })) as { log: string; truncated: boolean };

      expect(mockClient.get).toHaveBeenCalledWith(`${API}/tasks/t-1/exec-log`, {
        responseType: 'text',
      });
      expect(result.truncated).toBe(true);
      expect(result.log).toHaveLength(200_000);
    });
  });

  describe('test handler', () => {
    it('calls the healthcheck endpoint', async () => {
      mockClient.get.mockResolvedValue({ data: { status: 'ok' } });

      await expect(Detonate.test?.handler(mockContext)).resolves.toEqual({});
      expect(mockClient.get).toHaveBeenCalledWith(`${API}/healthcheck`, undefined);
    });

    it('fails when the gateway rejects the key', async () => {
      mockClient.get.mockRejectedValue(httpError(401, 'unauthorized'));

      await expect(Detonate.test?.handler(mockContext)).rejects.toThrow(
        'Detonate healthcheck failed (status 401): unauthorized'
      );
    });

    it('fails before any request when the URL is missing', async () => {
      const noUrl = { ...mockContext, config: {} } as unknown as ActionContext;

      await expect(Detonate.test?.handler(noUrl)).rejects.toThrow(
        'missing the required URL configuration field'
      );
      expect(mockClient.get).not.toHaveBeenCalled();
    });
  });
});
