/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Client as EsClient } from '@elastic/elasticsearch';
import { ALERT_INDEX, assertAttackDiscoveryDataGate } from './chrysalis_seed';

// Runs only against a dedicated Elasticsearch (set PERSONA_MATRIX_LIVE_ES to its URL, with
// credentials in the URL if it needs them; skipped otherwise). It writes only throwaway indices
// named after the run and deletes them afterwards, even when an assertion fails.
const describeLive = process.env.PERSONA_MATRIX_LIVE_ES ? describe : describe.skip;

const WINDOW = { start: '2026-03-01T00:00:00.000Z', end: '2026-04-01T00:00:00.000Z' };
const IN_WINDOW = '2026-03-20T10:00:00.000Z';

// The security alerts template maps `dynamic: false` with `labels` as a bare object, so
// `labels.simulation` is stored in _source but never searchable.
const ALERTS_MAPPING = {
  dynamic: false,
  properties: {
    '@timestamp': { type: 'date' },
    tags: { type: 'keyword' },
    agent: { properties: { id: { type: 'keyword' } } },
    labels: { type: 'object' },
    kibana: {
      properties: {
        alert: {
          properties: {
            workflow_status: { type: 'keyword' },
            building_block_type: { type: 'keyword' },
          },
        },
      },
    },
  },
} as const;

describeLive('dedicated Elasticsearch: Attack Discovery data gate', () => {
  let esClient: EsClient;
  const runId = Date.now();
  const created: string[] = [];

  beforeAll(() => {
    esClient = new EsClient({ node: process.env.PERSONA_MATRIX_LIVE_ES });
  });

  afterAll(async () => {
    if (created.length > 0) {
      await esClient.indices.delete({ index: created, ignore_unavailable: true }).catch(() => {});
    }
    await esClient.close();
  });

  const base = { '@timestamp': IN_WINDOW, 'kibana.alert.workflow_status': 'open' };
  const open = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, doc: base }));

  const bulk = async (index: string, docs: Array<{ id: string; doc: object }>) => {
    const response = await esClient.bulk({
      index,
      refresh: 'wait_for',
      operations: docs.flatMap(({ id, doc }) => [{ create: { _id: id } }, doc]),
    });
    expect(response.errors).toBe(false);
  };

  // Names start with a dot and the restored indices are hidden, like the real
  // `.internal.alerts-security.alerts-default-*` indices behind `.alerts-security.alerts-default`.
  const createIndex = async (index: string, mappings: object = ALERTS_MAPPING) => {
    created.push(index);
    await esClient.indices.create({
      index,
      mappings,
      settings: { 'index.hidden': true },
    });
  };

  const setup = (name: string) => {
    const prefix = `.persona-matrix-gate-live-${name}-${runId}`;
    const alias = prefix;
    return {
      alias,
      restored: `${prefix}-restored-000001`,
      foreign: `${prefix}-foreign-000001`,
      gate: () =>
        assertAttackDiscoveryDataGate({
          esClient,
          alertsIndex: alias,
          restoredIndexPattern: `${prefix}-restored-*`,
          window: WINDOW,
        }),
    };
  };

  const addToAlias = (alias: string, ...indices: string[]) =>
    esClient.indices.updateAliases({
      actions: indices.map((index) => ({ add: { index, alias } })),
    });

  it('counts only alerts Attack Discovery reads and fails on every Chrysalis marker', async () => {
    const { alias, restored, foreign, gate } = setup('markers');
    await createIndex(restored);
    await createIndex(foreign);
    await addToAlias(alias, restored, foreign);

    const chrysalisMarkers = [
      {
        id: `persona-matrix-seed-${ALERT_INDEX}-0`,
        doc: { ...base, '@timestamp': '2026-07-01' },
      },
      { id: 'tagged', doc: { ...base, tags: ['chrysalis-sim'] } },
      { id: 'agent', doc: { ...base, agent: { id: 'chrysalis-sim-agent' } } },
    ];
    const unreadByAttackDiscovery = [
      { id: 'label-only', doc: { ...base, labels: { simulation: 'chrysalis-sim' } } },
      { id: 'old', doc: { ...base, '@timestamp': '2026-02-01T00:00:00.000Z' } },
      { id: 'closed', doc: { ...base, 'kibana.alert.workflow_status': 'closed' } },
      {
        id: 'building-block',
        doc: { ...base, kibana: { alert: { building_block_type: 'default' } } },
      },
    ];
    await bulk(restored, [...open(80, 'clean'), ...unreadByAttackDiscovery]);
    await bulk(foreign, [
      { id: 'closed-foreign', doc: { ...base, 'kibana.alert.workflow_status': 'closed' } },
    ]);

    // label-only counts as non-Chrysalis (`labels.simulation` is unsearchable); old, closed and
    // building-block alerts are never counted. Foreign docs AD would not read are tolerated.
    await expect(gate()).resolves.toEqual({ nonChrysalis: 81, chrysalis: 0 });

    await bulk(restored, chrysalisMarkers);
    await expect(gate()).rejects.toThrow(/Chrysalis alerts=3 \(need 0\)/);
    // Removing the markers one by one drops the Chrysalis count one by one: each clause matches.
    for (const [i, { id }] of chrysalisMarkers.entries()) {
      await esClient.delete({ index: restored, id, refresh: 'wait_for' });
      const remaining = chrysalisMarkers.length - i - 1;
      if (remaining > 0) {
        await expect(gate()).rejects.toThrow(`Chrysalis alerts=${remaining} (need 0)`);
      }
    }
    await expect(gate()).resolves.toEqual({ nonChrysalis: 81, chrysalis: 0 });

    // A foreign alert AD would read, behind the alias but outside the restored indices.
    await bulk(foreign, [{ id: 'open-foreign', doc: base }]);
    await expect(gate()).rejects.toThrow(/1 foreign alerts Attack Discovery would read/);
  }, 120000);

  it('rejects an index behind the alias that does not map the marker fields', async () => {
    const { alias, restored, foreign, gate } = setup('unmapped');
    await createIndex(restored);
    await createIndex(foreign, {
      dynamic: false,
      properties: {
        '@timestamp': { type: 'date' },
        kibana: { properties: { alert: { properties: { workflow_status: { type: 'keyword' } } } } },
      },
    });
    await addToAlias(alias, restored, foreign);
    await bulk(restored, open(80, 'clean'));

    await expect(gate()).rejects.toThrow(/marker fields are not mapped.*agent\.id: .*unmapped/);
  }, 120000);

  it('rejects a foreign index that mimics the restored count when the restore is not behind the alias', async () => {
    const { alias, restored, foreign, gate } = setup('provenance');
    await createIndex(restored);
    await createIndex(foreign);
    await addToAlias(alias, foreign);
    await bulk(restored, open(95, 'restored'));
    await bulk(foreign, open(95, 'foreign'));

    await expect(gate()).rejects.toThrow(
      /restored indices not \(fully\) behind the alias \(0\/95\), 95 foreign alerts/
    );

    await addToAlias(alias, restored);
    await expect(gate()).rejects.toThrow(/95 foreign alerts Attack Discovery would read/);
  }, 120000);
});
