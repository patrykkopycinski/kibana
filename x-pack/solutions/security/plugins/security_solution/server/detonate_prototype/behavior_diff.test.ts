/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';

import { DETONATE_ALERT_KINDS, DETONATE_UNCATEGORIZED } from '../../common/detonate_prototype';
import { categoryCountsForRun } from './behavior_diff';

const STREAM = 'logs-detonate.sandbox-default';

interface StreamDoc {
  'detonate.task_id': string;
  'detonate.alert_kind'?: string;
  'event.category'?: string;
}

const alertDoc = (taskId: string, kind: string, category?: string): StreamDoc => ({
  'detonate.task_id': taskId,
  'detonate.alert_kind': kind,
  ...(category ? { 'event.category': category } : {}),
});

/** A process-event doc retained from before the stream held alerts only: no alert kind. */
const processEventDoc = (taskId: string, category: string): StreamDoc => ({
  'detonate.task_id': taskId,
  'event.category': category,
});

const unquote = (literal: string): string => JSON.parse(literal) as string;

/**
 * Evaluates the one ES|QL shape `categoryCountsForRun` sends against an
 * in-memory stream: `WHERE <field> == "v" [AND <field> IN ("a", "b")]…`
 * followed by `STATS count = COUNT(*) BY event.category`. It throws on any
 * other predicate, so a query change must be mirrored here on purpose.
 */
const fakeEsql = (docs: readonly StreamDoc[]) => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.esql.query.mockImplementation((async ({ query }: { query: string }) => {
    const [, , where, stats] = /^FROM (\S+) \| WHERE (.+) \| (STATS .+)$/.exec(query) ?? [];
    expect(stats).toBe('STATS count = COUNT(*) BY event.category');

    const matches = (doc: StreamDoc): boolean =>
      where.split(' AND ').every((predicate) => {
        const eq = /^([\w.]+) == ("(?:[^"\\]|\\.)*")$/.exec(predicate);
        if (eq) return doc[eq[1] as keyof StreamDoc] === unquote(eq[2]);
        const inList = /^([\w.]+) IN \((.+)\)$/.exec(predicate);
        if (inList) {
          const members = inList[2].split(', ').map(unquote);
          const value = doc[inList[1] as keyof StreamDoc];
          return value !== undefined && members.includes(value);
        }
        throw new Error(`Unsupported predicate: ${predicate}`);
      });

    const counts = new Map<string | null, number>();
    docs.filter(matches).forEach((doc) => {
      const category = doc['event.category'] ?? null;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return { columns: [], values: [...counts].map(([category, count]) => [count, category]) };
  }) as unknown as typeof esClient.esql.query);
  return esClient;
};

describe('categoryCountsForRun', () => {
  it('counts only alert docs when the persistent stream still holds historical process events', async () => {
    const esClient = fakeEsql([
      alertDoc('run-1', 'production-endpoint-alerts', 'malware'),
      alertDoc('run-1', 'diagnostic-endpoint-alerts', 'malware'),
      alertDoc('run-1', 'production-detection-alerts'),
      // Retained from the 30-day window, written under the same task id.
      processEventDoc('run-1', 'process'),
      processEventDoc('run-1', 'process'),
      processEventDoc('run-1', 'network'),
      // Another run's alerts never leak in.
      alertDoc('run-2', 'production-endpoint-alerts', 'malware'),
    ]);

    await expect(categoryCountsForRun(esClient, STREAM, 'run-1')).resolves.toEqual([
      { category: 'malware', count: 2 },
      { category: DETONATE_UNCATEGORIZED, count: 1 },
    ]);
  });

  it('matches the supported alert kinds exactly, not by prefix or case', async () => {
    const esClient = fakeEsql([
      alertDoc('run-1', 'production-endpoint-alerts', 'malware'),
      alertDoc('run-1', 'production-endpoint-alerts-v0', 'process'),
      alertDoc('run-1', 'Production-Endpoint-Alerts', 'process'),
      alertDoc('run-1', 'process-events', 'process'),
    ]);

    await expect(categoryCountsForRun(esClient, STREAM, 'run-1')).resolves.toEqual([
      { category: 'malware', count: 1 },
    ]);
  });

  it('gives the same answer on a fresh stream with no historical process events (control)', async () => {
    const alerts = [
      alertDoc('run-1', 'production-endpoint-alerts', 'malware'),
      alertDoc('run-1', 'production-detection-alerts', 'intrusion_detection'),
    ];
    const mixed = fakeEsql([...alerts, processEventDoc('run-1', 'process')]);
    const fresh = fakeEsql(alerts);

    const expected = [
      { category: 'intrusion_detection', count: 1 },
      { category: 'malware', count: 1 },
    ];
    await expect(categoryCountsForRun(fresh, STREAM, 'run-1')).resolves.toEqual(expected);
    await expect(categoryCountsForRun(mixed, STREAM, 'run-1')).resolves.toEqual(expected);
  });

  it('sends every supported alert kind and still escapes the task id', async () => {
    const esClient = fakeEsql([]);

    await categoryCountsForRun(esClient, STREAM, 'a"b');

    const [{ query }] = esClient.esql.query.mock.calls[0] as [{ query: string }];
    expect(query).toContain('detonate.task_id == "a\\"b"');
    DETONATE_ALERT_KINDS.forEach((kind) => expect(query).toContain(`"${kind}"`));
  });
});
