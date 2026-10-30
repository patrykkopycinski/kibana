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
import { buildTuningVariantMatrix, type TuningVariantSpec } from './tuning_variants';
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
  const windowMs = (fixtureId: string) =>
    fixtureId.startsWith('fp-schedule-') ? 24 * 3600 * 1000 : 10 * 60 * 1000;
  const stamp = (d: Record<string, unknown>) => Date.parse(d['@timestamp'] as string);

  it('without a variant reproduces the legacy FP-only cluster', () => {
    const { fp, tp } = build('fp-host-exception');
    expect(tp).toEqual([]);
    expect(fp).toHaveLength(ENTITY_PROFILES['fp-host-exception'].length);
  });

  it('v0/v1/v2 of one base rule differ in counts, hosts, users and timestamps', () => {
    const [v0, v1, v2] = [0, 1, 2].map((v) =>
      build('fp-host-exception', caseOf('fp-host-exception', v))
    );
    expect([v0.fp.length, v1.fp.length, v2.fp.length]).toEqual([6, 8, 10]);
    expect([v0.tp.length, v1.tp.length, v2.tp.length]).toEqual([3, 4, 4]);

    const distinct = (docs: Array<Record<string, unknown>>, key: 'host' | 'user') =>
      new Set(docs.map((d) => (d[key] as { name: string }).name)).size;
    expect(distinct(v1.fp, 'host')).toBe(4);
    expect(distinct(v1.fp, 'user')).toBe(2);
    expect(distinct(v2.fp, 'host')).toBe(1);
    expect(distinct(v2.fp, 'user')).toBe(1);
    expect(distinct(v1.fp, 'host')).not.toBe(distinct(v2.fp, 'host'));

    const stamps = (docs: Array<Record<string, unknown>>) => docs.map(stamp);
    expect(stamps(v0.fp)).not.toEqual(stamps(v1.fp).slice(0, 6));
    expect(Math.min(...stamps(v1.fp))).toBeLessThan(Math.min(...stamps(v0.fp)));
    // v2 ("single") spreads over the window; v0 is a burst.
    expect(Math.max(...stamps(v2.fp)) - Math.min(...stamps(v2.fp))).toBeGreaterThan(
      Math.max(...stamps(v0.fp)) - Math.min(...stamps(v0.fp))
    );
  });

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

  it('never writes the answer key (case id, fixture id, az-eval markers) into ES docs', () => {
    for (const spec of matrix) {
      const { fp, tp } = build(spec.baseId, spec);
      const json = JSON.stringify([...fp, ...tp]);
      expect(json).not.toContain('az-eval');
      expect(json).not.toContain(spec.caseId);
    }
  });

  it('seeds every field the base query references; TP docs satisfy the base query itself', () => {
    // Every variant base rule must have a replayable base query, or this test is vacuous for it.
    const baseIds = [...new Set(matrix.map((m) => m.baseId))];
    baseIds.forEach((fixtureId) => {
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
