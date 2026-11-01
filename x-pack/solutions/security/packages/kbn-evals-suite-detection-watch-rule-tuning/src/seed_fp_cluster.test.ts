/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ENTITY_PROFILES,
  FIXTURE_QUERIES,
  buildSeedDocs,
  seedRuleAndFpAlerts,
} from '../evals/seed_fp_cluster';
import { matchesQuery, parseSimpleQuery } from './backtest_grader';
import { buildTuningVariantMatrix, globSeparates, type TuningVariantSpec } from './tuning_variants';
import { ALERTS_INDEX } from './constants';

/**
 * Executes the seeder against a mocked kbn-evals fetch and ES client, so the rule-create
 * call site is pinned by behaviour rather than by a source regex. The kbn-evals fetch
 * defaults to GET: a create call without `method: 'POST'` becomes a read-rule request
 * with no id, returns 400 and fails every case at seed.
 */

interface BulkParams {
  index: string;
  operations: Array<Record<string, unknown>>;
}

const RULES_PATH = '/api/detection_engine/rules';
// Deliberately non-zero: a hard-coded `0` (the fresh-create value) at the baseAlert call
// site must fail these tests.
const CREATED_REVISION = 3;
const CREATED_RULE_ID = 'rule-uuid-from-create-response';

const setup = (createResponse: { id?: string; revision?: number } = {}) => {
  const fetch = jest.fn(async (path: string, options?: Record<string, unknown>) => {
    if (options?.method === 'POST' && path.startsWith(RULES_PATH)) {
      return { id: CREATED_RULE_ID, revision: CREATED_REVISION, ...createResponse };
    }
    if (options?.method === 'DELETE') return {};
    // Mirrors the real API: anything else is a read-rule request with no id.
    throw new Error(`400 Bad Request: unexpected ${String(options?.method ?? 'GET')} ${path}`);
  });
  const bulk = jest.fn(async (_params: BulkParams) => ({ errors: false, items: [] }));
  const log = { info: jest.fn() };
  const ctx = { fetch, esClient: { bulk }, log } as unknown as Parameters<
    typeof seedRuleAndFpAlerts
  >[0];
  return { ctx, fetch, bulk };
};

const fixture = { id: 'fp-host-exception', ruleType: 'query', expected: 'exception' };

describe('seedRuleAndFpAlerts', () => {
  it('creates the rule with POST to /api/detection_engine/rules', async () => {
    const { ctx, fetch } = setup();
    await seedRuleAndFpAlerts(ctx, fixture, 'unique-1');

    const createCalls = fetch.mock.calls.filter(
      ([path, options]) => path.startsWith(RULES_PATH) && options?.body !== undefined
    );
    expect(createCalls).toHaveLength(1);
    const [path, options] = createCalls[0];
    expect(options?.method).toBe('POST');
    expect(path.split('?')[0]).toBe(RULES_PATH);
    expect(JSON.parse(options?.body as string)).toEqual(
      expect.objectContaining({ type: 'query', enabled: true })
    );
  });

  it('seeds kibana.alert.rule.revision on every alert from the create response', async () => {
    const { ctx, bulk } = setup();
    const { seededUuid } = await seedRuleAndFpAlerts(ctx, fixture, 'unique-2');

    expect(seededUuid).toBe(CREATED_RULE_ID);
    expect(bulk).toHaveBeenCalledTimes(1);
    const [{ index, operations }] = bulk.mock.calls[0];
    expect(index).toBe(ALERTS_INDEX);
    const docs = operations.filter((op) => 'kibana.alert.rule.uuid' in op);
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc['kibana.alert.rule.uuid']).toBe(CREATED_RULE_ID);
      expect(doc['kibana.alert.rule.revision']).toBe(CREATED_REVISION);
    }
  });

  it('falls back to revision 0 when the create response omits it', async () => {
    const { ctx, bulk } = setup({ revision: undefined });
    await seedRuleAndFpAlerts(ctx, fixture, 'unique-3');

    const [{ operations }] = bulk.mock.calls[0];
    const docs = operations.filter((op) => 'kibana.alert.rule.uuid' in op);
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((d) => d['kibana.alert.rule.revision'] === 0)).toBe(true);
  });
});

describe('buildSeedDocs', () => {
  const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
  const build = (fixtureId: string, variant?: TuningVariantSpec) =>
    buildSeedDocs({
      fixtureId,
      ruleUuid: 'rule-uuid',
      ruleName: 'eval rule-tuning abc',
      ruleId: 'eval-rt-abc',
      ruleRevision: 0,
      variant,
      now: NOW,
    });
  const matrix = buildTuningVariantMatrix();
  const caseOf = (baseId: string, v: number) =>
    matrix.find((m) => m.baseId === baseId && m.variant === v) as TuningVariantSpec;
  type Doc = Record<string, unknown>;
  const windowMs = (fixtureId: string) =>
    fixtureId.startsWith('fp-schedule-') ? 24 * 3600 * 1000 : 10 * 60 * 1000;
  const stamp = (d: Record<string, unknown>) => Date.parse(d['@timestamp'] as string);

  it('without a variant reproduces the legacy FP-only cluster', () => {
    const { fp, tp } = build('fp-host-exception');
    expect(tp).toEqual([]);
    expect(fp).toHaveLength(ENTITY_PROFILES['fp-host-exception'].length);
  });

  const distinct = (docs: Array<Record<string, unknown>>, key: 'host' | 'user') =>
    new Set(docs.map((d) => (d[key] as { name: string }).name)).size;
  const stamps = (docs: Array<Record<string, unknown>>) => docs.map(stamp);
  const baseIds = [...new Set(matrix.map((m) => m.baseId))];

  it('v0/v1/v2 of an exception base differ in counts, hosts, users and timestamps', () => {
    const [v0, v1, v2] = [0, 1, 2].map((v) =>
      build('fp-host-exception', caseOf('fp-host-exception', v))
    );
    expect([v0.fp.length, v1.fp.length, v2.fp.length]).toEqual([6, 8, 10]);
    expect([v0.tp.length, v1.tp.length, v2.tp.length]).toEqual([3, 4, 4]);

    expect(distinct(v1.fp, 'host')).toBe(4);
    expect(distinct(v1.fp, 'user')).toBe(2);
    expect(distinct(v2.fp, 'host')).toBe(1);
    expect(distinct(v2.fp, 'user')).toBe(1);

    expect(stamps(v0.fp)).not.toEqual(stamps(v1.fp).slice(0, 6));
    expect(Math.min(...stamps(v1.fp))).toBeLessThan(Math.min(...stamps(v0.fp)));
    // v2 ("single") spreads over the window; v0 is a burst.
    expect(Math.max(...stamps(v2.fp)) - Math.min(...stamps(v2.fp))).toBeGreaterThan(
      Math.max(...stamps(v0.fp)) - Math.min(...stamps(v0.fp))
    );
  });

  it.each(baseIds)('%s: v0, v1 and v2 are pairwise distinguishable', (baseId) => {
    const built = [0, 1, 2].map((v) => build(baseId, caseOf(baseId, v)));
    const signature = ({ fp, tp }: { fp: Doc[]; tp: Doc[] }) =>
      JSON.stringify([
        fp.length,
        tp.length,
        distinct(fp, 'host'),
        distinct(fp, 'user'),
        // Relative ages: absolute stamps are anchored to NOW and would only differ by shape.
        stamps(fp).map((t) => NOW - t),
      ]);
    const signatures = built.map(signature);
    expect(new Set(signatures).size).toBe(3);
  });

  it.each(baseIds.filter((id) => id.startsWith('fp-threshold-')))(
    '%s: FP burst sizes grow across variants and every host stays above the threshold of 3',
    (baseId) => {
      const counts = [0, 1, 2].map((v) => build(baseId, caseOf(baseId, v)).fp.length);
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
      [0, 1, 2].forEach((v) => {
        const { fp } = build(baseId, caseOf(baseId, v));
        const perHost = new Map<string, number>();
        fp.forEach((d) => {
          const name = (d.host as { name: string }).name;
          perHost.set(name, (perHost.get(name) ?? 0) + 1);
        });
        expect(Math.min(...perHost.values())).toBeGreaterThan(3);
        // The worker screens rules on fp_count >= 50% of all alerts; variants must clear it.
        expect(fp.length * 100).toBeGreaterThanOrEqual(
          (fp.length + caseOf(baseId, v).tpCount) * 50
        );
      });
    }
  );

  // P0-1: collapsing entities on a non-exception base would make an exception the tightest fix.
  it.each(matrix.filter((m) => m.expected !== 'exception').map((m) => [m.caseId, m] as const))(
    "%s: seeded FP entity diversity is at least the base profile's",
    (_caseId, spec) => {
      const profile = ENTITY_PROFILES[spec.baseId];
      const { fp } = build(spec.baseId, spec);
      expect(distinct(fp, 'host')).toBeGreaterThanOrEqual(new Set(profile.map((e) => e.host)).size);
      expect(distinct(fp, 'user')).toBeGreaterThanOrEqual(new Set(profile.map((e) => e.user)).size);
    }
  );

  it.each(matrix.map((m) => [m.caseId, m] as const))(
    '%s: timestamps stay inside the rule window and FP outnumber TP',
    (_caseId, spec) => {
      const { fp, tp } = build(spec.baseId, spec);
      expect(fp.length).toBeGreaterThan(tp.length);
      const lo = NOW - windowMs(spec.baseId);
      for (const doc of [...fp, ...tp]) {
        expect(stamp(doc)).toBeGreaterThanOrEqual(lo);
        expect(stamp(doc)).toBeLessThanOrEqual(NOW);
      }
    }
  );

  it('never writes the answer key (case id, fixture id, tp/fp markers) into ES docs', () => {
    const LABEL_WORDS = /\btp\b|true.?pos|false.?pos|fp.cluster|\bfp\b/i;
    const allIds = [...matrix.map((m) => m.caseId), ...baseIds];
    const jsonOf = (docs: Doc[]) =>
      JSON.stringify(docs).replace(/"kibana\.alert\.workflow_reason":"[a-z_]+",?/g, '');
    const cases: Array<[string, string]> = [
      ...matrix.map((spec): [string, string] => {
        const { fp, tp } = build(spec.baseId, spec);
        return [spec.caseId, jsonOf([...fp, ...tp])];
      }),
      // The default (non-variant) path must not carry a marker either.
      ...baseIds.map((id): [string, string] => [`${id} (base path)`, jsonOf(build(id).fp)]),
    ];
    expect(cases.length).toBe(40);
    for (const [label, json] of cases) {
      expect({ label, hit: LABEL_WORDS.exec(json)?.[0] }).toEqual({ label, hit: undefined });
      expect(json).not.toContain('az-eval');
      for (const id of allIds)
        expect({ label, leaks: json.includes(id) }).toEqual({ label, leaks: false });
    }
  });

  // A field present on only one cohort (`and not source.ip:*`) separates TP from FP by structure
  // alone, so the backtest would score a no-diagnosis proposal perfectly.
  const flatKeys = (value: unknown, prefix = ''): string[] =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value as Doc).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];
  const keySet = (doc: Doc) => [...new Set(flatKeys(doc))].sort();

  it.each(matrix.map((m) => [m.caseId, m] as const))(
    '%s: TP and FP docs carry the same flattened field keys (workflow_reason differs in value only)',
    (_caseId, spec) => {
      const { fp, tp } = build(spec.baseId, spec);
      const fpKeys = keySet(fp[0]);
      expect(fpKeys).toContain('source.ip');
      [...fp, ...tp].forEach((doc) => expect(keySet(doc)).toEqual(fpKeys));
    }
  );

  it.each(matrix.map((m) => [m.caseId, m] as const))(
    '%s: TP source.ip is present and never equals an FP address of the case',
    (_caseId, spec) => {
      const { fp, tp } = build(spec.baseId, spec);
      const fpIps = new Set(fp.map((d) => (d.source as { ip: string }).ip));
      const profileIps = new Set(ENTITY_PROFILES[spec.baseId].map((e) => e.ip));
      tp.forEach((doc) => {
        const { ip } = doc.source as { ip: string };
        expect(ip).toMatch(/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
        expect(fpIps.has(ip)).toBe(false);
        expect(profileIps.has(ip)).toBe(false);
      });
    }
  );

  // A single glob in the GRADER's grammar (`*` = any sequence, `?` = one char, any position —
  // see globToRegExp) must not separate the cohorts: any `source.ip does_not_match` entry
  // that would suppress the whole FP cluster necessarily suppresses at least one TP (and
  // symmetrically for the TPs). This test enumerates dot-aligned compositions of
  // per-octet-position forms (see octetForms in tuning_variants.ts) via globSeparates,
  // shared with the allocator so it proves the same predicate the search enforces;
  // non-dot-aligned shapes were verified empirically against the shipped seed data.
  it.each([
    ...matrix.map((m) => [m.caseId, m] as const),
    ...baseIds.map((id) => [`${id} (base path)`, undefined] as const),
  ])('%s: no dot-aligned per-octet-form glob separates TP from FP', (caseId, spec) => {
    const baseId = spec?.baseId ?? caseId.split(' ')[0];
    const { fp, tp } = build(baseId, spec);
    const fpIps = fp.map((d) => (d.source as { ip: string }).ip);
    const tpIps = tp.map((d) => (d.source as { ip: string }).ip);
    if (tpIps.length === 0) return; // base path seeds no TPs; nothing to interleave
    expect(globSeparates(fpIps, tpIps)).toBe(false);
  });

  it.each(matrix.map((m) => [m.caseId, m] as const))(
    '%s: TP fourth octets cover every digit length the case FP fourths use',
    (_caseId, spec) => {
      const { fp, tp } = build(spec.baseId, spec);
      const lens = (ips: string[]) => new Set(ips.map((ip) => ip.split('.')[3].length));
      const fpLens = lens(fp.map((d) => (d.source as { ip: string }).ip));
      const tpLens = lens(tp.map((d) => (d.source as { ip: string }).ip));
      for (const l of fpLens) expect(tpLens.has(l)).toBe(true);
    }
  );

  it('names TP and FP entities from one scheme, so a host name does not reveal the label', () => {
    const spec = caseOf('fp-host-exception', 1);
    const { fp, tp } = build('fp-host-exception', spec);
    const names = [...fp, ...tp].flatMap((d) => [
      (d.host as { name: string }).name,
      (d.user as { name: string }).name,
    ]);
    names.forEach((n) => expect(n).toMatch(/^eval-[0-9a-f]+-[hu]\d+$/));
  });

  it('seeds every field the base query references; TP docs satisfy the base query itself', () => {
    // Every variant base rule must have a replayable base query, or this test is vacuous for it.
    const replayBaseIds = [...new Set(matrix.map((m) => m.baseId))];
    replayBaseIds.forEach((fixtureId) => {
      const query = FIXTURE_QUERIES[fixtureId];
      const clauses = parseSimpleQuery(query);
      expect({ fixtureId, replayable: clauses !== null }).toEqual({ fixtureId, replayable: true });

      const spec = matrix.find((m) => m.baseId === fixtureId) as TuningVariantSpec;
      const { fp, tp } = build(fixtureId, spec);
      expect(tp.length).toBeGreaterThan(0);
      // TPs are graded for retention under a narrowed query, so they must match the base one.
      tp.forEach((doc) =>
        expect({ fixtureId, matched: matchesQuery(doc, query) }).toEqual({
          fixtureId,
          matched: true,
        })
      );
      // FP profiles may legitimately carry a different process than the base term (the
      // legacy host profile has a `node` row), but every referenced field must be present.
      [...fp, ...tp].forEach((doc) =>
        (clauses ?? []).forEach(({ field }) =>
          expect({ fixtureId, field, present: matchesQuery(doc, `${field}:*`) }).toEqual({
            fixtureId,
            field,
            present: true,
          })
        )
      );
    });
  });
});

describe('seedRuleAndFpAlerts rule uuid', () => {
  it('throws, cleans up and indexes nothing when the create response has no id', async () => {
    const { ctx, fetch, bulk } = setup({ id: undefined });
    const deleteByQuery = jest.fn(async () => ({}));
    const withDelete = {
      ...ctx,
      esClient: { bulk, deleteByQuery },
    } as unknown as typeof ctx;

    await expect(seedRuleAndFpAlerts(withDelete, fixture, 'unique-noid')).rejects.toThrow(
      /returned no id/
    );
    expect(bulk).not.toHaveBeenCalled();
    expect(deleteByQuery).toHaveBeenCalledTimes(1);
    const deletes = fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE');
    // One stale-rule delete before the create, one cleanup delete after the failure.
    expect(deletes).toHaveLength(2);
  });
});

describe('seedRuleAndFpAlerts failure cleanup', () => {
  it('deletes the rule and its alerts when bulk indexing throws, instead of leaking them', async () => {
    const { ctx, fetch } = setup();
    const deleteByQuery = jest.fn(async () => ({}));
    const failing = {
      ...ctx,
      esClient: {
        bulk: jest.fn(async () => {
          throw new Error('es unavailable');
        }),
        deleteByQuery,
      },
    } as unknown as typeof ctx;

    await expect(seedRuleAndFpAlerts(failing, fixture, 'unique-fail')).rejects.toThrow(
      'es unavailable'
    );
    expect(deleteByQuery).toHaveBeenCalledTimes(1);
    const deletes = fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE');
    // One stale-rule delete before the create, one cleanup delete after the failure.
    expect(deletes).toHaveLength(2);
  });
});
