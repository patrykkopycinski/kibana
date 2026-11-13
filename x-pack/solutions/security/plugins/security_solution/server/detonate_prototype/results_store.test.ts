/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';

import type { DetonationRecord } from './detonation_record';
import { DETONATION_RECORD_FIELDS } from './detonation_record';
import { createRunRecorder, resultsIndexTemplate, upsertDetonationRecord } from './results_store';

const RECORD: DetonationRecord = {
  '@timestamp': '2026-01-01T00:00:00.000Z',
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

  it('installs the template once, then writes every record', async () => {
    const { esClient, recordRun } = setup();

    await recordRun('team-a', () => RECORD);
    await recordRun('team-a', () => ({ ...RECORD, 'detonate.task_id': 'task-2' }));

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
