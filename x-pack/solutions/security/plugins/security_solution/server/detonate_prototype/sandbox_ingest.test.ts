/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import { DEFAULT_INDEX_PATTERN } from '../../common/constants';
import type { DetonateTask } from '../../common/detonate_prototype';
import { detonateSandboxStreamName } from '../../common/detonate_prototype';
import {
  ingestSandboxDocs,
  installSandboxTemplate,
  sandboxIndexTemplate,
  toSandboxDoc,
} from './sandbox_ingest';

const TASK = { id: 'task-1' } as DetonateTask;

/** Shaped like an Endpoint alert from the service; every value is synthetic. */
const endpointAlert = (overrides: Record<string, unknown> = {}) => ({
  '@timestamp': '2026-11-01T10:00:00.000Z',
  message: 'Malware Detection Alert',
  event: {
    id: 'event-1',
    kind: 'alert',
    category: ['malware', 'intrusion_detection'],
    code: 'malicious_file',
  },
  process: {
    entity_id: 'proc-1',
    pid: 42,
    name: 'sh',
    args: ['sh', '-c', 'run'],
    parent: { entity_id: 'proc-0', pid: 1 },
    Ext: { ancestry: ['proc-0'], code_signature: { trusted: false } },
  },
  file: { name: 'sample.bin', hash: { sha256: 'b'.repeat(64) }, Ext: { quarantine_path: '/q' } },
  host: {
    name: 'sandbox-host-name',
    hostname: 'sandbox-host-name',
    id: 'sandbox-host-id',
    ip: ['10.1.2.3'],
    mac: ['00-00-00-00-00-01'],
    os: { type: 'linux', name: 'Ubuntu' },
  },
  agent: { id: 'sandbox-agent-id', type: 'endpoint', version: '9.0.0', build: { original: 'x' } },
  elastic: { agent: { id: 'sandbox-agent-id' } },
  Endpoint: { policy: { applied: { id: 'policy-id', name: 'policy-name' } } },
  Responses: [{ action: { action: 'kill_process' } }],
  data_stream: { dataset: 'endpoint.alerts', namespace: 'default', type: 'logs' },
  ecs: { version: '8.11.0' },
  user: { name: 'root' },
  ...overrides,
});

describe('toSandboxDoc', () => {
  it('copies only allow-listed fields and replaces the sandbox host and agent', () => {
    const result = toSandboxDoc(TASK, 'production-endpoint-alerts', endpointAlert());

    expect(result).toEqual({
      _id: 'task-1:event-1',
      doc: {
        '@timestamp': '2026-11-01T10:00:00.000Z',
        message: 'Malware Detection Alert',
        event: {
          id: 'event-1',
          kind: 'alert',
          category: ['malware', 'intrusion_detection'],
          code: 'malicious_file',
        },
        process: {
          entity_id: 'proc-1',
          pid: 42,
          name: 'sh',
          args: ['sh', '-c', 'run'],
          parent: { entity_id: 'proc-0', pid: 1 },
          Ext: { ancestry: 'proc-0' },
        },
        file: { name: 'sample.bin', hash: { sha256: 'b'.repeat(64) } },
        host: { name: 'detonate-sandbox-linux', os: { type: 'linux' } },
        agent: { id: 'detonate-task-1', type: 'endpoint' },
        user: { name: 'root' },
        tags: ['sandbox'],
        detonate: { task_id: 'task-1', alert_kind: 'production-endpoint-alerts' },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/sandbox-host|sandbox-agent|policy|10\.1\.2\.3/);
  });

  it('reads flattened keys and a full search hit', () => {
    const result = toSandboxDoc(TASK, 'production-detection-alerts', {
      _id: 'hit-1',
      _source: {
        '@timestamp': '2026-11-01T10:00:00.000Z',
        'kibana.alert.uuid': 'uuid-1',
        'kibana.alert.rule.name': 'Rule A',
      },
    });

    expect(result?._id).toBe('task-1:uuid-1');
    expect(result?.doc).toMatchObject({
      kibana: { alert: { rule: { name: 'Rule A' } } },
      host: { name: 'detonate-sandbox-vm' },
    });
    expect(result?.doc).not.toHaveProperty('agent');
  });

  it('keys an alert with no uuid or event id on a hash of its content', () => {
    const doc = { '@timestamp': '2026-11-01T10:00:00.000Z', message: 'one' };

    const first = toSandboxDoc(TASK, 'diagnostic-endpoint-alerts', doc);
    const again = toSandboxDoc(TASK, 'diagnostic-endpoint-alerts', { ...doc });
    const other = toSandboxDoc(TASK, 'diagnostic-endpoint-alerts', { ...doc, message: 'two' });

    expect(first?._id).toMatch(/^task-1:[a-f0-9]{64}$/);
    expect(again?._id).toBe(first?._id);
    expect(other?._id).not.toBe(first?._id);
  });

  it('drops an alert without a timestamp', () => {
    expect(
      toSandboxDoc(TASK, 'production-endpoint-alerts', endpointAlert({ '@timestamp': undefined }))
    ).toBeUndefined();
  });
});

describe('ingestSandboxDocs', () => {
  const createEsClient = (statuses: number[]) => {
    const bulk = jest
      .fn()
      .mockResolvedValue({ items: statuses.map((status) => ({ create: { status } })) });
    return { client: { bulk } as unknown as ElasticsearchClient, bulk };
  };

  it('counts created, duplicate, failed and dropped docs', async () => {
    const { client, bulk } = createEsClient([201, 409, 500]);
    const alerts = ['e-1', 'e-2', 'e-3'].map((id) => ({
      kind: 'production-endpoint-alerts' as const,
      doc: endpointAlert({ event: { id } }),
    }));
    alerts.push({
      kind: 'production-endpoint-alerts' as const,
      doc: endpointAlert({ '@timestamp': undefined }),
    });

    const counts = await ingestSandboxDocs(
      client,
      '.kibana-detonate-sandbox-default',
      TASK,
      alerts
    );

    expect(counts).toEqual({ ingested: 1, duplicates: 1, dropped: 1, failed: 1 });
    const [[{ operations }]] = bulk.mock.calls;
    expect(operations).toHaveLength(6);
    expect(operations[0]).toEqual({
      create: { _index: '.kibana-detonate-sandbox-default', _id: 'task-1:e-1' },
    });
  });

  it('makes no bulk call when nothing is left to copy', async () => {
    const { client, bulk } = createEsClient([]);

    const counts = await ingestSandboxDocs(client, '.kibana-detonate-sandbox-default', TASK, [
      { kind: 'production-endpoint-alerts', doc: { message: 'no timestamp' } },
    ]);

    expect(counts).toEqual({ ingested: 0, duplicates: 0, dropped: 1, failed: 0 });
    expect(bulk).not.toHaveBeenCalled();
  });
});

describe('sandbox alerts as signals', () => {
  const globToRegExp = (glob: string) =>
    new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

  // Exclusion entries ('-*elastic-cloud-logs-*') are patterns too: the stream must not match them either.
  const siemPatterns = ['.alerts-security.alerts-*', ...DEFAULT_INDEX_PATTERN].map((pattern) =>
    globToRegExp(pattern.replace(/^-/, ''))
  );

  // Detection alerts arrive flat with `event.kind: signal` (the recorded corpus shape);
  // the mapper copies it, so the stream's detection alerts stay signals without a rewrite.
  it.each([
    [
      'production-detection-alerts' as const,
      'signal',
      {
        '@timestamp': '2026-11-01T10:00:00.000Z',
        'kibana.alert.uuid': 'uuid-1',
        'kibana.alert.rule.name': 'Rule A',
        'event.kind': 'signal',
        'kibana.alert.original_event.kind': 'alert',
      },
    ],
    ['production-endpoint-alerts' as const, 'alert', endpointAlert()],
    ['diagnostic-endpoint-alerts' as const, 'alert', endpointAlert()],
    [
      'process-events' as const,
      'event',
      { '@timestamp': '2026-11-01T10:00:00.000Z', event: { id: 'proc-event-1', kind: 'event' } },
    ],
  ])(
    'keeps %s docs tagged, attributed and out of SIEM index patterns (event.kind %s)',
    async (kind, eventKind, source) => {
      const bulk = jest.fn().mockResolvedValue({ items: [{ create: { status: 201 } }] });
      const stream = detonateSandboxStreamName('default');

      await ingestSandboxDocs({ bulk } as unknown as ElasticsearchClient, stream, TASK, [
        { kind, doc: source },
      ]);

      const [[{ operations }]] = bulk.mock.calls;
      const [{ create }, doc] = operations;
      expect(doc).toMatchObject({
        event: { kind: eventKind },
        tags: ['sandbox'],
        detonate: { task_id: 'task-1', alert_kind: kind },
      });
      expect(siemPatterns.some((pattern) => pattern.test(create._index))).toBe(false);
      expect(create._index).toBe(stream);
    }
  );

  it('matches SIEM index names with the wildcard helper', () => {
    expect(siemPatterns.some((pattern) => pattern.test('.alerts-security.alerts-default'))).toBe(
      true
    );
    expect(siemPatterns.some((pattern) => pattern.test('logs-endpoint.events.process-x'))).toBe(
      true
    );
  });
});

describe('sandboxIndexTemplate', () => {
  it('describes a hidden, 30-day, non-dynamic stream with no aliases', () => {
    const template = sandboxIndexTemplate();

    expect(template).toMatchObject({
      name: 'kibana-detonate-sandbox',
      index_patterns: ['.kibana-detonate-sandbox-*'],
      priority: 500,
      data_stream: { hidden: true },
      template: {
        settings: { 'index.hidden': true },
        lifecycle: { data_retention: '30d' },
        mappings: { dynamic: false },
      },
    });
    expect(template.template).not.toHaveProperty('aliases');
    expect(template.template?.mappings?.properties).toMatchObject({
      '@timestamp': { type: 'date' },
      host: { properties: { name: { type: 'keyword' } } },
      detonate: { properties: { task_id: { type: 'keyword' } } },
      destination: { properties: { ip: { type: 'ip' } } },
    });
    expect(template.template?.mappings?.properties).not.toHaveProperty('Endpoint');
  });

  it('is written with putIndexTemplate', async () => {
    const putIndexTemplate = jest.fn().mockResolvedValue({ acknowledged: true });

    await installSandboxTemplate({
      indices: { putIndexTemplate },
    } as unknown as ElasticsearchClient);

    expect(putIndexTemplate).toHaveBeenCalledWith(sandboxIndexTemplate());
  });
});
