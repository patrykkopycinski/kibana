/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';

const log = { info: jest.fn(), warning: jest.fn() } as unknown as ToolingLog;

const loadProfile = (profile: 'minimal' | 'parity') => {
  jest.resetModules();
  process.env.SEED_PROFILE = profile;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./chrysalis_seed') as typeof import('./chrysalis_seed');
};

interface MockClient {
  bulk: jest.Mock;
  deleteByQuery: jest.Mock;
}

const createClient = (): MockClient => ({
  bulk: jest.fn().mockResolvedValue({ errors: false, items: [] }),
  deleteByQuery: jest.fn().mockResolvedValue({}),
});

const asEs = (client: MockClient) => client as unknown as EsClient;

describe('chrysalis_seed', () => {
  afterEach(() => {
    delete process.env.SEED_PROFILE;
    jest.clearAllMocks();
  });

  describe('seedProfile resolution', () => {
    it('defaults to minimal when SEED_PROFILE is unset or empty', () => {
      delete process.env.SEED_PROFILE;
      let unset: typeof import('./chrysalis_seed');
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        unset = require('./chrysalis_seed');
      });
      expect(unset!.seedProfile).toBe('minimal');

      process.env.SEED_PROFILE = '';
      let empty: typeof import('./chrysalis_seed');
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        empty = require('./chrysalis_seed');
      });
      expect(empty!.seedProfile).toBe('minimal');
    });

    it('resolves explicit minimal and parity', () => {
      expect(loadProfile('minimal').seedProfile).toBe('minimal');
      expect(loadProfile('parity').seedProfile).toBe('parity');
    });

    it('throws for the removed enriched profile instead of silently falling back', () => {
      process.env.SEED_PROFILE = 'enriched';
      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('./chrysalis_seed');
        });
      }).toThrow(/enriched.*minimal.*parity|Unknown SEED_PROFILE 'enriched'/s);
    });

    it('throws for any other unknown profile (case-sensitive)', () => {
      process.env.SEED_PROFILE = 'Parity';
      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('./chrysalis_seed');
        });
      }).toThrow(/Unknown SEED_PROFILE 'Parity'/);
    });
  });

  describe('seedChrysalisAlerts (minimal profile)', () => {
    it('rejects when the alert bulk reports item-level errors', async () => {
      const { seedChrysalisAlerts } = loadProfile('minimal');
      const client = createClient();
      client.bulk.mockResolvedValueOnce({
        errors: true,
        items: [{ create: { error: { type: 'mapper_parsing_exception', reason: 'bad doc' } } }],
      });

      await expect(seedChrysalisAlerts({ esClient: asEs(client), log })).rejects.toThrow(
        /mapper_parsing_exception/
      );
    });

    it('resolves when every bulk succeeds', async () => {
      const { seedChrysalisAlerts } = loadProfile('minimal');
      const client = createClient();

      await expect(seedChrysalisAlerts({ esClient: asEs(client), log })).resolves.toBeUndefined();
    });
  });

  describe('seedChrysalisAlerts (parity profile) restamping', () => {
    it('shifts nested first_seen by the same offset as @timestamp', async () => {
      const { seedChrysalisAlerts } = loadProfile('parity');
      const { PARITY_DOCS } =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('./chrysalis_parity_docs') as typeof import('./chrysalis_parity_docs');
      const client = createClient();

      await seedChrysalisAlerts({ esClient: asEs(client), log });

      // Find the bulk body for the threat-intel index and its source doc.
      const tiIndex = 'logs-ti_chrysalis_sim-default';
      const tiCall = client.bulk.mock.calls.find(
        ([arg]) => (arg as { index: string }).index === tiIndex
      );
      expect(tiCall).toBeDefined();
      const seededDocs = (tiCall?.[0] as { operations: unknown[] }).operations.filter(
        (op) => typeof op === 'object' && op !== null && !('create' in (op as object))
      ) as Array<Record<string, unknown>>;

      const seeded = seededDocs.find(
        (d) =>
          (d.threat as { indicator?: { first_seen?: unknown } } | undefined)?.indicator
            ?.first_seen !== undefined
      );
      expect(seeded).toBeDefined();

      const seededIndicator = (seeded!.threat as { indicator: Record<string, unknown> }).indicator;
      const srcDoc = PARITY_DOCS.find(
        ({ index, doc }) =>
          index === tiIndex &&
          (doc.threat as { indicator?: Record<string, unknown> } | undefined)?.indicator
            ?.description === seededIndicator.description
      )!.doc;
      const srcIndicator = (srcDoc.threat as { indicator: Record<string, unknown> }).indicator;
      expect(srcIndicator.first_seen).toBeDefined();

      const tsOffset =
        Date.parse(seeded!['@timestamp'] as string) - Date.parse(srcDoc['@timestamp'] as string);
      const firstSeenOffset =
        Date.parse(seededIndicator.first_seen as string) -
        Date.parse(srcIndicator.first_seen as string);
      const lastSeenOffset =
        Date.parse(seededIndicator.last_seen as string) -
        Date.parse(srcIndicator.last_seen as string);

      // Same doc → identical offset across @timestamp and the nested keys.
      expect(firstSeenOffset).toBe(tsOffset);
      expect(lastSeenOffset).toBe(tsOffset);

      // Offset is a real shift to ~now (positive, large).
      const now = Date.now();
      expect(Date.parse(seeded!['@timestamp'] as string)).toBeGreaterThan(now - 10 * 60 * 1000);
    });
  });

  describe('cleanupChrysalisAlerts is id-scoped', () => {
    it('deletes only the seeded alert ids, never match_all', async () => {
      const { seedChrysalisAlerts, cleanupChrysalisAlerts } = loadProfile('minimal');
      const client = createClient();

      await seedChrysalisAlerts({ esClient: asEs(client), log });
      // Minimal seeding assigns deterministic ids via the seed prefix.
      const bulkOps = client.bulk.mock.calls[0][0] as { operations: unknown[] };
      const createIds = bulkOps.operations
        .filter((op) => typeof op === 'object' && op !== null && 'create' in (op as object))
        .map((op) => (op as { create: { _id: string } }).create._id);
      expect(createIds).toEqual([
        'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-0',
        'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-1',
        'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-2',
      ]);

      await cleanupChrysalisAlerts({ esClient: asEs(client), log });

      const deletes = client.deleteByQuery.mock.calls.filter(
        ([arg]) =>
          (arg as { index: string }).index === '.internal.alerts-security.alerts-default-000001'
      );
      expect(deletes).toHaveLength(1);
      const query = (deletes[0][0] as { query: unknown }).query;
      expect(query).not.toEqual({ match_all: {} });
      const ids = (query as { ids: { values: string[] } }).ids.values;
      // Default cleanup sweeps every id a seed call could have written; the
      // three seeded ids must all be covered.
      expect(ids).toEqual(
        expect.arrayContaining([
          'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-0',
          'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-1',
          'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-2',
        ])
      );
    });

    it('cleans up every alert when seeding more than the default count and cleaning up with defaults', async () => {
      const { seedChrysalisAlerts, cleanupChrysalisAlerts } = loadProfile('minimal');
      const client = createClient();

      await seedChrysalisAlerts({ esClient: asEs(client), log, count: 5 });
      await cleanupChrysalisAlerts({ esClient: asEs(client), log });

      const deletes = client.deleteByQuery.mock.calls.filter(
        ([arg]) =>
          (arg as { index: string }).index === '.internal.alerts-security.alerts-default-000001'
      );
      expect(deletes).toHaveLength(1);
      const query = (deletes[0][0] as { query: { ids?: { values: string[] } } }).query;
      const values = query.ids?.values ?? [];
      // Default cleanup covers every id a seed call could have written, so all
      // five seeded ids (<0..4>) must be swept — none left behind.
      expect(values).toContain(
        'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-4'
      );
      expect(values).toContain(
        'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-0'
      );
    });
  });

  describe('alert count guard', () => {
    it('rejects non-integer, zero, negative, and out-of-range counts on seed and cleanup', async () => {
      const { seedChrysalisAlerts, cleanupChrysalisAlerts } = loadProfile('minimal');
      const client = createClient();

      for (const bad of [0, -1, 2.5, 51]) {
        await expect(
          seedChrysalisAlerts({ esClient: asEs(client), log, count: bad })
        ).rejects.toThrow(/Invalid alert count/);
        await expect(
          cleanupChrysalisAlerts({ esClient: asEs(client), log, count: bad })
        ).rejects.toThrow(/Invalid alert count/);
      }
      expect(client.bulk).not.toHaveBeenCalled();
      expect(client.deleteByQuery).not.toHaveBeenCalled();
    });
  });

  describe('assertAttackDiscoveryDataGate', () => {
    const window = { start: '2026-03-01T00:00:00.000Z', end: '2026-04-01T00:00:00.000Z' };
    const ALIAS = '.alerts-security.alerts-default';
    const RESTORED = '.internal.alerts-security.alerts-default-000001';
    const FOREIGN = 'custom-alerts-000001';
    const IN_WINDOW = '2026-03-20T10:00:00.000Z';

    type Doc = Record<string, unknown> & { _id: string };
    type Clause = Record<string, unknown>;

    const globToRegExp = (glob: string) =>
      new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

    const lookup = (doc: Doc, field: string): unknown[] => {
      const value = doc[field];
      return value === undefined ? [] : Array.isArray(value) ? value : [value];
    };

    // Evaluates the query clauses the gate (and AD's retriever) use against in-memory docs, so
    // tests assert which alerts are counted instead of how the query is shaped.
    const matches = (doc: Doc, clause: Clause): boolean => {
      const [type] = Object.keys(clause);
      const body = clause[type] as Record<string, unknown>;
      const list = (value: unknown) => (Array.isArray(value) ? (value as Clause[]) : []);
      switch (type) {
        case 'ids':
          return (body.values as string[]).includes(doc._id);
        case 'term':
        case 'match_phrase': {
          const [[field, expected]] = Object.entries(body);
          return lookup(doc, field).includes(expected);
        }
        case 'wildcard': {
          const [[field, pattern]] = Object.entries(body);
          const regExp = globToRegExp(pattern as string);
          return lookup(doc, field).some((v) => regExp.test(String(v)));
        }
        case 'exists':
          return lookup(doc, body.field as string).length > 0;
        case 'range': {
          const [[field, bounds]] = Object.entries(body);
          const { gte, lte } = bounds as { gte: string; lte: string };
          return lookup(doc, field).some(
            (v) =>
              Date.parse(String(v)) >= Date.parse(gte) && Date.parse(String(v)) <= Date.parse(lte)
          );
        }
        case 'bool': {
          const should = list(body.should);
          const minShould =
            (body.minimum_should_match as number | undefined) ??
            (should.length > 0 && !list(body.must).length && !list(body.filter).length ? 1 : 0);
          return (
            [...list(body.must), ...list(body.filter)].every((c) => matches(doc, c)) &&
            !list(body.must_not).some((c) => matches(doc, c)) &&
            should.filter((c) => matches(doc, c)).length >= minShould
          );
        }
        default:
          throw new Error(`unsupported clause ${type}`);
      }
    };

    interface FakeCluster {
      indices: Record<string, Doc[]>;
      aliases?: Record<string, string[]>;
      unmappedFields?: string[];
      // Per-field `field_caps` response, e.g. `{ 'agent.id': { text: {} } }`.
      fieldCaps?: Record<string, Record<string, { searchable?: boolean }>>;
    }

    const createCluster = ({
      indices,
      aliases = {},
      unmappedFields = [],
      fieldCaps = {},
    }: FakeCluster) => {
      const resolve = (target: string | string[]): string[] => {
        const names = new Set<string>();
        for (const expression of Array.isArray(target) ? target : [target]) {
          const pattern = globToRegExp(expression);
          Object.keys(indices)
            .filter((name) => pattern.test(name))
            .forEach((name) => names.add(name));
          (aliases[expression] ?? []).forEach((name) => names.add(name));
        }
        return [...names];
      };
      return {
        count: jest.fn(async ({ index, query }: { index: string | string[]; query: Clause }) => ({
          count: resolve(index)
            .flatMap((name) => indices[name].map((doc) => ({ ...doc, _index: name })))
            .filter((doc) => matches(doc, query)).length,
        })),
        fieldCaps: jest.fn(async ({ fields }: { fields: string[] }) => ({
          fields: Object.fromEntries(
            fields.map((field) => [
              field,
              fieldCaps[field] ??
                (unmappedFields.includes(field) ? { unmapped: {} } : { keyword: {} }),
            ])
          ),
        })),
      } as unknown as EsClient & { count: jest.Mock; fieldCaps: jest.Mock };
    };

    const alert = (id: string, extra: Record<string, unknown> = {}): Doc => ({
      _id: id,
      '@timestamp': IN_WINDOW,
      'kibana.alert.workflow_status': 'open',
      ...extra,
    });
    const alerts = (n: number, prefix = 'alert', extra: Record<string, unknown> = {}) =>
      Array.from({ length: n }, (_, i) => alert(`${prefix}-${i}`, extra));

    const cleanCluster = (restored = alerts(95)): FakeCluster => ({
      indices: { [RESTORED]: restored },
      aliases: { [ALIAS]: [RESTORED] },
    });

    const runGate = (cluster: FakeCluster) => {
      const { assertAttackDiscoveryDataGate } = loadProfile('minimal');
      return assertAttackDiscoveryDataGate({
        esClient: createCluster(cluster),
        alertsIndex: ALIAS,
        window,
      });
    };

    it('passes with a clean 95-alert corpus and returns both counts', async () => {
      await expect(runGate(cleanCluster())).resolves.toEqual({ nonChrysalis: 95, chrysalis: 0 });
    });

    it('passes at exactly the 80-alert floor', async () => {
      await expect(runGate(cleanCluster(alerts(80)))).resolves.toEqual({
        nonChrysalis: 80,
        chrysalis: 0,
      });
    });

    it('fails below the floor and reports the counts', async () => {
      await expect(runGate(cleanCluster(alerts(79)))).rejects.toThrow(
        /restored indices=79 \(need >= 80\), Chrysalis alerts=0/
      );
    });

    it('does not count alerts outside the window', async () => {
      const outside = alerts(20, 'old', { '@timestamp': '2026-02-01T00:00:00.000Z' });
      await expect(runGate(cleanCluster([...alerts(79), ...outside]))).rejects.toThrow(
        /restored indices=79/
      );
    });

    it('does not count alerts Attack Discovery never reads (closed, building block)', async () => {
      const closed = alerts(10, 'closed', { 'kibana.alert.workflow_status': 'closed' });
      const buildingBlock = alerts(10, 'bb', { 'kibana.alert.building_block_type': 'default' });
      await expect(
        runGate(cleanCluster([...alerts(79), ...closed, ...buildingBlock]))
      ).rejects.toThrow(/restored indices=79/);
    });

    it('counts acknowledged alerts', async () => {
      const acknowledged = alerts(15, 'ack', { 'kibana.alert.workflow_status': 'acknowledged' });
      await expect(runGate(cleanCluster([...alerts(80), ...acknowledged]))).resolves.toEqual({
        nonChrysalis: 95,
        chrysalis: 0,
      });
    });

    describe.each([
      [
        'a minimal-profile seed id',
        'persona-matrix-seed-.internal.alerts-security.alerts-default-000001-0',
        {},
      ],
      ['a parity-profile seed id', 'persona-matrix-seed-logs-chrysalis-sim.alerts-default-0', {}],
      ['the chrysalis-sim tag', 'foreign-1', { tags: ['other', 'chrysalis-sim'] }],
      ['the chrysalis-sim agent id', 'foreign-2', { 'agent.id': 'chrysalis-sim-agent' }],
    ])('Chrysalis alert identified by %s', (_name, id, fields) => {
      it('fails the gate even when it is outside the window and closed', async () => {
        const stray = alert(id, {
          ...fields,
          '@timestamp': '2026-07-01T00:00:00.000Z',
          'kibana.alert.workflow_status': 'closed',
        });
        await expect(runGate(cleanCluster([...alerts(95), stray]))).rejects.toThrow(
          /Chrysalis alerts=1 \(need 0\)/
        );
      });

      it('is not counted towards the non-Chrysalis floor', async () => {
        const stray = alert(id, fields);
        await expect(runGate(cleanCluster([...alerts(79), stray]))).rejects.toThrow(
          /restored indices=79/
        );
      });
    });

    it('does not treat a label-only simulation doc as Chrysalis (the field is unsearchable)', async () => {
      const labelOnly = alerts(1, 'label', { 'labels.simulation': 'chrysalis-sim' });
      await expect(runGate(cleanCluster([...alerts(95), ...labelOnly]))).resolves.toEqual({
        nonChrysalis: 96,
        chrysalis: 0,
      });
    });

    describe('foreign indices behind the alias', () => {
      it('fails when the restore produced nothing and foreign docs behind the alias fill the floor', async () => {
        await expect(
          runGate({
            indices: { [RESTORED]: [], [FOREIGN]: alerts(95, 'foreign') },
            aliases: { [ALIAS]: [RESTORED, FOREIGN] },
          })
        ).rejects.toThrow(/restored indices=0 \(need >= 80\)/);
      });

      it('fails when the restore is complete but foreign docs sit behind the alias', async () => {
        await expect(
          runGate({
            indices: { [RESTORED]: alerts(95), [FOREIGN]: alerts(5, 'foreign') },
            aliases: { [ALIAS]: [RESTORED, FOREIGN] },
          })
        ).rejects.toThrow(/5 foreign alerts Attack Discovery would read sit behind the alias/);
      });

      it('fails when the restored indices are not behind the alias and a foreign index with the same readable count is', async () => {
        await expect(
          runGate({
            indices: { [RESTORED]: alerts(95), [FOREIGN]: alerts(95, 'foreign') },
            aliases: { [ALIAS]: [FOREIGN] },
          })
        ).rejects.toThrow(
          /restored indices not \(fully\) behind the alias \(0\/95\), 95 foreign alerts/
        );
      });

      it('fails when only some restored indices are behind the alias', async () => {
        const SECOND = '.internal.alerts-security.alerts-default-000002';
        await expect(
          runGate({
            indices: { [RESTORED]: alerts(80), [SECOND]: alerts(15, 'second') },
            aliases: { [ALIAS]: [RESTORED] },
          })
        ).rejects.toThrow(/restored indices not \(fully\) behind the alias \(80\/95\)/);
      });

      it('ignores foreign docs behind the alias that Attack Discovery would not read', async () => {
        const closed = alerts(5, 'foreign', { 'kibana.alert.workflow_status': 'closed' });
        await expect(
          runGate({
            indices: { [RESTORED]: alerts(95), [FOREIGN]: closed },
            aliases: { [ALIAS]: [RESTORED, FOREIGN] },
          })
        ).resolves.toEqual({ nonChrysalis: 95, chrysalis: 0 });
      });

      it('fails when a foreign Chrysalis alert sits behind the alias', async () => {
        await expect(
          runGate({
            indices: {
              [RESTORED]: alerts(95),
              [FOREIGN]: alerts(1, 'sim', { 'agent.id': 'chrysalis-sim-agent' }),
            },
            aliases: { [ALIAS]: [RESTORED, FOREIGN] },
          })
        ).rejects.toThrow(/Chrysalis alerts=1 \(need 0\)/);
      });
    });

    describe('marker field mapping precheck', () => {
      const rejectsFor = (fieldCaps: FakeCluster['fieldCaps'], message: RegExp) => {
        const { assertAttackDiscoveryDataGate } = loadProfile('minimal');
        const esClient = createCluster({ ...cleanCluster(), fieldCaps });
        return expect(
          assertAttackDiscoveryDataGate({ esClient, alertsIndex: ALIAS, window })
        ).rejects.toThrow(message);
      };

      it('fails when a field is mapped on some indices and unmapped on others', async () => {
        await rejectsFor(
          { 'agent.id': { keyword: {}, unmapped: {} } },
          /marker fields are not mapped as searchable keywords.*agent\.id: unmapped/
        );
      });

      it('fails when a marker field is a text field', async () => {
        await rejectsFor({ tags: { text: {} } }, /tags: text/);
      });

      it('fails when a marker field is a keyword on one index and text on another', async () => {
        await rejectsFor({ tags: { keyword: {}, text: {} } }, /tags: text/);
      });

      it('fails when a keyword marker field is not searchable', async () => {
        await rejectsFor(
          { 'agent.id': { keyword: { searchable: false } } },
          /agent\.id: keyword \(not searchable\)/
        );
      });

      it('accepts constant_keyword marker fields', async () => {
        const { assertAttackDiscoveryDataGate } = loadProfile('minimal');
        const esClient = createCluster({
          ...cleanCluster(),
          fieldCaps: { tags: { constant_keyword: {} }, 'agent.id': { constant_keyword: {} } },
        });
        await expect(
          assertAttackDiscoveryDataGate({ esClient, alertsIndex: ALIAS, window })
        ).resolves.toEqual({ nonChrysalis: 95, chrysalis: 0 });
      });

      it.each(['tags', 'agent.id'])('fails before counting when %s is unmapped', async (field) => {
        const { assertAttackDiscoveryDataGate } = loadProfile('minimal');
        const esClient = createCluster({ ...cleanCluster(), unmappedFields: [field] });
        await expect(
          assertAttackDiscoveryDataGate({ esClient, alertsIndex: ALIAS, window })
        ).rejects.toThrow(new RegExp(`marker fields are not mapped.*${field.replace('.', '\\.')}`));
        expect(esClient.count).not.toHaveBeenCalled();
      });
    });
  });
});
