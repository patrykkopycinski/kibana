/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';

import {
  DETONATE_MAX_FAILED_RUNS,
  DETONATE_TRANSIENT_DECISION_TTL_MS,
} from '../../common/detonate_prototype';
import type { DetonationRecord } from './detonation_record';
import { DETONATION_RECORD_FIELDS } from './detonation_record';
import {
  createResultsIndexEnsurer,
  createRunRecorder,
  getAlertOutcomes,
  resultsIndexTemplate,
  setHandoffMarkers,
  upsertDetonationRecord,
  writeAlertDecisions,
} from './results_store';

const RECORD: DetonationRecord = {
  '@timestamp': '2026-01-01T00:00:00.000Z',
  'detonate.doc_kind': 'run',
  'event.start': '2026-01-01T00:00:00.000Z',
  'detonate.task_id': 'task-1',
  'detonate.state': 'running',
  'detonate.step.number': 1,
  'detonate.step.of': 5,
  'detonate.step.label': 'Starting',
  'detonate.step.worker': 'worker',
  'detonate.step.status': 'started',
  'detonate.vm.has_internet': false,
  'detonate.alerts.total': 0,
  'detonate.alerts.production_endpoint': 0,
  'detonate.alerts.diagnostic_endpoint': 0,
  'detonate.alerts.production_detection': 0,
  'detonate.endpoint_event_codes': [],
  'detonate.detection_rule_names': [],
  'detonate.detections_to_review': [],
};

interface MappingNode {
  type?: string;
  properties?: Record<string, MappingNode>;
}

const mappedType = (properties: Record<string, MappingNode>, path: string) =>
  path
    .split('.')
    .reduce<MappingNode | undefined>(
      (node, key) => (node?.properties ?? properties)[key] ?? undefined,
      undefined
    )?.type;

describe('resultsIndexTemplate', () => {
  const template = resultsIndexTemplate();

  it('is a hidden plain index, not a data stream, with no lifecycle', () => {
    expect(template.data_stream).toBeUndefined();
    expect(template.template?.lifecycle).toBeUndefined();
    expect(template.template?.settings).toEqual({ 'index.hidden': true });
    expect(template._meta).toMatchObject({ managed_by: 'security_solution' });
    expect(template.index_patterns).toEqual(['.kibana-detonate-results-*']);
  });

  it('does not map fields it was not told about', () => {
    expect(template.template?.mappings?.dynamic).toBe(false);
  });

  it.each(Object.entries(DETONATION_RECORD_FIELDS))(
    'maps %s as %s, nested under its dotted path',
    (path, type) => {
      const properties = template.template?.mappings?.properties as Record<string, MappingNode>;
      expect(mappedType(properties, path)).toBe(type);
    }
  );
});

describe('upsertDetonationRecord', () => {
  it('writes the record by task id into the space index, merging into an existing document', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    await upsertDetonationRecord(esClient, 'team-a', RECORD);

    expect(esClient.update).toHaveBeenCalledWith(
      {
        index: '.kibana-detonate-results-team-a',
        id: 'task-1',
        doc: RECORD,
        doc_as_upsert: true,
      },
      { requestTimeout: 2000, maxRetries: 0 }
    );
  });

  it('refuses a space id that cannot name an index', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    await expect(upsertDetonationRecord(esClient, 'Bad Space', RECORD)).rejects.toThrow(
      'cannot name a results index'
    );
    expect(esClient.update).not.toHaveBeenCalled();
  });
});

describe('createRunRecorder', () => {
  const setup = () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    const logger = loggingSystemMock.createLogger();
    const recordRun = createRunRecorder({
      getInternalEsClient: async () => esClient,
      logger,
    });
    return { esClient, logger, recordRun };
  };

  it('installs the template and updates the mapping once, then writes every record', async () => {
    const { esClient, recordRun } = setup();

    await recordRun('team-a', () => RECORD);
    await recordRun('team-a', () => ({ ...RECORD, 'detonate.task_id': 'task-2' }));

    expect(esClient.indices.putMapping).toHaveBeenCalledTimes(1);
    expect(esClient.indices.putIndexTemplate).toHaveBeenCalledTimes(1);
    expect(esClient.indices.putIndexTemplate).toHaveBeenCalledWith(expect.anything(), {
      requestTimeout: 2000,
      maxRetries: 0,
    });
    expect(esClient.update).toHaveBeenCalledTimes(2);
  });

  it('logs a warning and resolves when the write fails', async () => {
    const { esClient, logger, recordRun } = setup();
    esClient.update.mockRejectedValue(new Error('es down'));

    await expect(recordRun('team-a', () => RECORD)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('task-1'));
  });

  it('retries the template install after it failed, and does not write in between', async () => {
    const { esClient, logger, recordRun } = setup();
    esClient.indices.putIndexTemplate
      .mockRejectedValueOnce(new Error('no privileges'))
      .mockResolvedValue({ acknowledged: true });

    await recordRun('team-a', () => RECORD);
    expect(esClient.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);

    await recordRun('team-a', () => RECORD);
    expect(esClient.indices.putIndexTemplate).toHaveBeenCalledTimes(2);
    expect(esClient.update).toHaveBeenCalledTimes(1);
  });
});

const responseError = (statusCode: number, type: string) =>
  new errors.ResponseError({
    statusCode,
    body: { error: { type, reason: type } },
    headers: {},
    meta: {},
    warnings: [],
  } as unknown as ConstructorParameters<typeof errors.ResponseError>[0]);

describe('createResultsIndexEnsurer', () => {
  it('updates the mapping of an existing index once per space', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    const ensure = createResultsIndexEnsurer();

    await ensure(esClient, 'team-a');
    await ensure(esClient, 'team-a');
    await ensure(esClient, 'team-b');

    expect(esClient.indices.putIndexTemplate).toHaveBeenCalledTimes(1);
    expect(esClient.indices.putMapping).toHaveBeenCalledTimes(2);
    expect(esClient.indices.putMapping).toHaveBeenCalledWith(
      {
        index: '.kibana-detonate-results-team-a',
        properties: expect.objectContaining({
          detonate: expect.objectContaining({
            properties: expect.objectContaining({
              decision: { properties: expect.objectContaining({ state: expect.anything() }) },
            }),
          }),
        }),
      },
      { requestTimeout: 2000, maxRetries: 0 }
    );
  });

  it('accepts an index that does not exist yet, because its first write uses the template', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.putMapping.mockRejectedValue(responseError(404, 'index_not_found_exception'));

    await expect(createResultsIndexEnsurer()(esClient, 'team-a')).resolves.toBeUndefined();
  });

  it('retries a mapping update that failed on the next call', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.putMapping
      .mockRejectedValueOnce(responseError(403, 'security_exception'))
      .mockResolvedValue({ acknowledged: true });
    const ensure = createResultsIndexEnsurer();

    await expect(ensure(esClient, 'team-a')).rejects.toThrow();
    await expect(ensure(esClient, 'team-a')).resolves.toBeUndefined();

    expect(esClient.indices.putMapping).toHaveBeenCalledTimes(2);
  });
});

interface ReleaseOperation {
  script: { source: string; params: { terminal: string[] } };
  upsert: Record<string, unknown>;
}

interface OutcomeSearch {
  size: number;
  query: {
    bool: {
      must_not: unknown[];
      filter: Array<{ bool: { should: unknown[] } }>;
    };
  };
}

describe('writeAlertDecisions', () => {
  const NOW = new Date('2026-02-01T00:00:00.000Z');

  it('upserts one document per alert, keyed by the alert id', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.bulk.mockResolvedValue({ errors: false, items: [], took: 1 });

    const written = await writeAlertDecisions(
      esClient,
      'team-a',
      [
        {
          alertId: 'alert-1',
          state: 'verdict_applied',
          verdict: 'malicious',
          taskId: 'task-1',
          sha256: 'ABCDEF',
          executionId: 'exec-1',
        },
        { alertId: 'alert-2', state: 'queued' },
      ],
      NOW
    );

    expect(written).toBe(2);
    const [{ operations }, options] = esClient.bulk.mock.calls[0] as unknown as [
      { operations: unknown[] },
      unknown
    ];
    expect(options).toEqual({ requestTimeout: 10000, maxRetries: 1 });
    expect(operations).toEqual([
      { update: { _index: '.kibana-detonate-results-team-a', _id: 'alert-1' } },
      {
        doc: {
          '@timestamp': NOW.toISOString(),
          'detonate.doc_kind': 'alert_decision',
          'detonate.alert_id': 'alert-1',
          'detonate.decision.state': 'verdict_applied',
          'detonate.space_id': 'team-a',
          'detonate.verdict': 'malicious',
          'detonate.task_id': 'task-1',
          'file.hash.sha256': 'abcdef',
          'detonate.workflow.execution_id': 'exec-1',
        },
        doc_as_upsert: true,
      },
      { update: { _index: '.kibana-detonate-results-team-a', _id: 'alert-2' } },
      {
        doc: expect.objectContaining({
          'detonate.alert_id': 'alert-2',
          'detonate.decision.state': 'queued',
        }),
        doc_as_upsert: true,
      },
    ]);
  });

  it('writes nothing for an empty list', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    await expect(writeAlertDecisions(esClient, 'team-a', [])).resolves.toBe(0);
    expect(esClient.bulk).not.toHaveBeenCalled();
  });

  it('throws, naming the alerts, when any bulk item failed', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.bulk.mockResolvedValue({
      errors: true,
      took: 1,
      items: [
        { update: { _index: 'i', _id: 'alert-1', status: 200 } },
        {
          update: {
            _index: 'i',
            _id: 'alert-2',
            status: 400,
            error: { type: 'mapper_exception', reason: 'bad' },
          },
        },
      ],
    });

    await expect(
      writeAlertDecisions(esClient, 'team-a', [
        { alertId: 'alert-1', state: 'queued' },
        { alertId: 'alert-2', state: 'queued' },
      ])
    ).rejects.toThrow('Could not write 1 of 2 alert decisions: alert-2: mapper_exception: bad');
  });

  it('releases through a script that leaves a terminal decision alone', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.bulk.mockResolvedValue({ errors: false, items: [], took: 1 });

    await writeAlertDecisions(esClient, 'team-a', [{ alertId: 'alert-1', state: 'released' }], NOW);

    const { operations } = esClient.bulk.mock.calls[0][0] as unknown as {
      operations: [unknown, ReleaseOperation];
    };
    const [, release] = operations;
    expect(release.script.params.terminal).toEqual(expect.arrayContaining(['verdict_applied']));
    expect(release.script.source).toContain("ctx.op = 'noop'");
    expect(release.upsert['detonate.decision.state']).toBe('released');
    expect(release).not.toHaveProperty('doc_as_upsert');
  });
});

describe('getAlertOutcomes', () => {
  const NOW = Date.parse('2026-02-01T12:00:00.000Z');
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  const decisionDoc = (
    id: string,
    state: string,
    timestamp: string,
    extra: Record<string, unknown> = {}
  ) => ({
    _index: 'i',
    _id: id,
    found: true,
    _source: {
      'detonate.doc_kind': 'alert_decision',
      'detonate.decision.state': state,
      '@timestamp': timestamp,
      ...extra,
    },
  });

  const bucket = (
    key: string,
    {
      completed = 0,
      failed = 0,
      verdict,
    }: { completed?: number; failed?: number; verdict?: string }
  ) => ({
    key,
    completed: {
      doc_count: completed,
      latest: {
        hits: {
          hits:
            completed > 0
              ? [{ _source: { 'detonate.verdict': verdict, 'detonate.task_id': `task-${key}` } }]
              : [],
        },
      },
    },
    failed: { doc_count: failed },
  });

  const setup = ({
    decisions = [],
    byAlert = [],
    byHash = [],
  }: {
    decisions?: unknown[];
    byAlert?: unknown[];
    byHash?: unknown[];
  }) => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.mget.mockResolvedValue({ docs: decisions } as never);
    esClient.search.mockResolvedValue({
      aggregations: { by_alert: { buckets: byAlert }, by_hash: { buckets: byHash } },
    } as never);
    return esClient;
  };

  it('asks only the alerts it was given, and never reads decision documents as runs', async () => {
    const esClient = setup({});

    await getAlertOutcomes(
      esClient,
      'team-a',
      [{ alertId: 'a1', sha256: 'ABC' }, { alertId: 'a2' }],
      NOW
    );

    expect(esClient.mget).toHaveBeenCalledWith(
      expect.objectContaining({ index: '.kibana-detonate-results-team-a', ids: ['a1', 'a2'] }),
      expect.anything()
    );
    const search = esClient.search.mock.calls[0][0] as unknown as OutcomeSearch;
    expect(search.size).toBe(0);
    expect(search.query.bool.must_not).toEqual([
      { term: { 'detonate.doc_kind': 'alert_decision' } },
    ]);
    expect(search.query.bool.filter[0].bool.should).toEqual([
      { terms: { 'detonate.alert_id': ['a1', 'a2'] } },
      { terms: { 'file.hash.sha256': ['abc'] } },
    ]);
  });

  it('returns nothing, and asks nothing, for no alerts', async () => {
    const esClient = setup({});

    expect((await getAlertOutcomes(esClient, 'team-a', [], NOW)).size).toBe(0);
    expect(esClient.mget).not.toHaveBeenCalled();
  });

  it.each(['verdict_applied', 'known_malicious', 'skipped', 'not_eligible'] as const)(
    'excludes an alert with a terminal %s decision however old',
    async (state) => {
      const esClient = setup({ decisions: [decisionDoc('a1', state, ago(30 * 24 * 3600 * 1000))] });

      const outcomes = await getAlertOutcomes(esClient, 'team-a', [{ alertId: 'a1' }], NOW);

      expect(outcomes.get('a1')?.state).toBe(state);
    }
  );

  it.each(['queued', 'running'] as const)(
    'excludes a %s decision until the transient TTL, then lets the alert through',
    async (state) => {
      const esClient = setup({
        decisions: [
          decisionDoc('fresh', state, ago(DETONATE_TRANSIENT_DECISION_TTL_MS - 1000)),
          decisionDoc('stale', state, ago(DETONATE_TRANSIENT_DECISION_TTL_MS + 1000)),
        ],
      });

      const outcomes = await getAlertOutcomes(
        esClient,
        'team-a',
        [{ alertId: 'fresh' }, { alertId: 'stale' }],
        NOW
      );

      expect(outcomes.get('fresh')?.state).toBe(state);
      expect(outcomes.has('stale')).toBe(false);
    }
  );

  it.each(['queued', 'running'] as const)(
    'lets a %s decision exactly one TTL old through',
    async (state) => {
      const esClient = setup({
        decisions: [decisionDoc('a1', state, ago(DETONATE_TRANSIENT_DECISION_TTL_MS))],
      });

      const outcomes = await getAlertOutcomes(esClient, 'team-a', [{ alertId: 'a1' }], NOW);

      expect(outcomes.has('a1')).toBe(false);
    }
  );

  it('does not exclude a released alert', async () => {
    const esClient = setup({ decisions: [decisionDoc('a1', 'released', ago(1000))] });

    expect((await getAlertOutcomes(esClient, 'team-a', [{ alertId: 'a1' }], NOW)).size).toBe(0);
  });

  it('reports a completed run for the alert with its verdict and task', async () => {
    const esClient = setup({ byAlert: [bucket('a1', { completed: 1, verdict: 'malicious' })] });

    const outcomes = await getAlertOutcomes(esClient, 'team-a', [{ alertId: 'a1' }], NOW);

    expect(outcomes.get('a1')).toEqual({
      state: 'completed',
      verdict: 'malicious',
      task_id: 'task-a1',
    });
  });

  it('counts a completed run of a sibling alert with the same sample hash', async () => {
    const esClient = setup({
      byHash: [
        { key: 'abc', completed: bucket('abc', { completed: 1, verdict: 'benign' }).completed },
      ],
    });

    const outcomes = await getAlertOutcomes(
      esClient,
      'team-a',
      [
        { alertId: 'a1', sha256: 'ABC' },
        { alertId: 'a2', sha256: 'other' },
      ],
      NOW
    );

    expect(outcomes.get('a1')).toMatchObject({ state: 'completed', verdict: 'benign' });
    expect(outcomes.has('a2')).toBe(false);
  });

  it('caps an alert at the failed-run limit, not below it', async () => {
    const esClient = setup({
      byAlert: [
        bucket('under', { failed: DETONATE_MAX_FAILED_RUNS - 1 }),
        bucket('capped', { failed: DETONATE_MAX_FAILED_RUNS }),
      ],
    });

    const outcomes = await getAlertOutcomes(
      esClient,
      'team-a',
      [{ alertId: 'under' }, { alertId: 'capped' }],
      NOW
    );

    expect(outcomes.has('under')).toBe(false);
    expect(outcomes.get('capped')).toEqual({ state: 'retry_capped' });
  });

  it('treats an index that does not exist yet as having no outcomes', async () => {
    const esClient = setup({
      decisions: [
        { _index: 'i', _id: 'a1', error: { type: 'index_not_found_exception', reason: 'x' } },
      ],
    });

    expect((await getAlertOutcomes(esClient, 'team-a', [{ alertId: 'a1' }], NOW)).size).toBe(0);
  });

  it('fails on any other read error rather than letting every alert through', async () => {
    const esClient = setup({
      decisions: [{ _index: 'i', _id: 'a1', error: { type: 'security_exception', reason: 'no' } }],
    });

    await expect(getAlertOutcomes(esClient, 'team-a', [{ alertId: 'a1' }], NOW)).rejects.toThrow(
      'Could not read alert decisions: security_exception'
    );
  });

  it('ignores a run document that happens to share an alert id', async () => {
    const esClient = setup({
      decisions: [
        {
          _index: 'i',
          _id: 'a1',
          found: true,
          _source: { 'detonate.doc_kind': 'run', 'detonate.decision.state': 'skipped' },
        },
      ],
    });

    expect((await getAlertOutcomes(esClient, 'team-a', [{ alertId: 'a1' }], NOW)).size).toBe(0);
  });
});

describe('setHandoffMarkers', () => {
  it('updates the run document by id with the fields the markers map to', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    await expect(
      setHandoffMarkers({
        esClient,
        spaceId: 'team-a',
        taskId: 'task-1',
        add: ['detonate:hunt-done', 'detonate:hunt-done'],
        remove: ['detonate:hunt-requested'],
      })
    ).resolves.toBe(true);

    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        index: '.kibana-detonate-results-team-a',
        id: 'task-1',
        refresh: true,
        script: expect.objectContaining({
          params: {
            add: [{ field: 'detonate.handoff.hunt', value: 'done' }],
            remove: [{ field: 'detonate.handoff.hunt', value: 'requested' }],
          },
        }),
      }),
      expect.anything()
    );
    expect(esClient.update.mock.calls[0][0]).not.toHaveProperty('upsert');
    expect(esClient.update.mock.calls[0][0]).not.toHaveProperty('doc_as_upsert');
  });

  it('returns false when the run has no document, and rethrows any other failure', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    const args = {
      esClient,
      spaceId: 'team-a',
      taskId: 'task-1',
      add: ['detonate:hunt-done'] as const,
      remove: [] as const,
    };
    esClient.update.mockRejectedValueOnce(responseError(404, 'document_missing_exception'));
    await expect(setHandoffMarkers({ ...args, add: [...args.add], remove: [] })).resolves.toBe(
      false
    );

    esClient.update.mockRejectedValueOnce(responseError(500, 'boom'));
    await expect(setHandoffMarkers({ ...args, add: [...args.add], remove: [] })).rejects.toThrow();
  });
});

describe('a partial run write', () => {
  it('does not carry handoff fields, so a late write cannot clobber them', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    await upsertDetonationRecord(esClient, 'team-a', RECORD);

    const { doc } = esClient.update.mock.calls[0][0] as unknown as { doc: Record<string, unknown> };
    expect(Object.keys(doc).filter((key) => key.startsWith('detonate.handoff.'))).toEqual([]);
  });
});
