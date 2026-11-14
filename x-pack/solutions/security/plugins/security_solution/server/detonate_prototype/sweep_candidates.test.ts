/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DETONATE_SWEEP_MAX_PAGES,
  DETONATE_SWEEP_PAGE_SIZE,
} from '../../common/detonate_prototype';
import { DetonateServiceError } from './client';
import { listSweepCandidates } from './sweep_candidates';

const hash = (n: number) => n.toString(16).padStart(64, '0');

const alertHit = (n: number, sha256: string = hash(n)) => ({
  _id: `alert-${n}`,
  sort: [1_000_000 - n, `alert-${n}`],
  fields: { 'file.hash.sha256': [sha256] },
});

const page = (hits: unknown[]) => ({ hits: { hits } });

/** `mget` and `search` of the results store: only the ids in `decided` come back as decisions. */
const resultsClientDeciding = (decided: Set<string>) => ({
  mget: jest.fn().mockImplementation(async ({ ids }: { ids: string[] }) => ({
    docs: ids.map((_id) =>
      decided.has(_id)
        ? {
            _id,
            found: true,
            _source: {
              'detonate.doc_kind': 'alert_decision',
              'detonate.decision.state': 'verdict_applied',
              'detonate.verdict': 'benign',
            },
          }
        : { _id, found: false }
    ),
  })),
  search: jest
    .fn()
    .mockResolvedValue({ aggregations: { by_alert: { buckets: [] }, by_hash: { buckets: [] } } }),
});

describe('listSweepCandidates', () => {
  it('returns the undecided hashes as positional rows', async () => {
    const alertsClient = { search: jest.fn().mockResolvedValue(page([alertHit(1), alertHit(2)])) };
    const resultsClient = resultsClientDeciding(new Set(['alert-1']));

    const result = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClient as never,
      spaceId: 'default',
      limit: 10,
    });

    expect(result).toEqual({ values: [['alert-2', hash(2)]], scanned: 2, truncated: false });
  });

  it('keeps one alert per hash, case-insensitively, and drops values that are not a sha256', async () => {
    const upper = hash(0xabc).toUpperCase();
    const alertsClient = {
      search: jest
        .fn()
        .mockResolvedValue(
          page([alertHit(1, upper), alertHit(2, hash(0xabc)), alertHit(3, 'not-a-hash')])
        ),
    };

    const result = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClientDeciding(new Set()) as never,
      spaceId: 'default',
      limit: 10,
    });

    expect(result.values).toEqual([['alert-1', upper]]);
    expect(result.scanned).toBe(1);
  });

  it('pages past a full page of decided hashes to reach an older undecided one', async () => {
    const first = Array.from({ length: DETONATE_SWEEP_PAGE_SIZE }, (_, i) => alertHit(i + 1));
    const decided = new Set(first.map(({ _id }) => _id));
    const alertsClient = {
      search: jest
        .fn()
        .mockResolvedValueOnce(page(first))
        .mockResolvedValueOnce(page([alertHit(500)])),
    };

    const result = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClientDeciding(decided) as never,
      spaceId: 'default',
      limit: 5,
    });

    expect(result.values).toEqual([['alert-500', hash(500)]]);
    expect(alertsClient.search).toHaveBeenCalledTimes(2);
    expect(alertsClient.search.mock.calls[1][0].search_after).toEqual(first[first.length - 1].sort);
    expect(result.truncated).toBe(false);
  });

  it('stops paging once it has `limit` undecided hashes', async () => {
    const full = Array.from({ length: DETONATE_SWEEP_PAGE_SIZE }, (_, i) => alertHit(i + 1));
    const alertsClient = { search: jest.fn().mockResolvedValue(page(full)) };

    const result = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClientDeciding(new Set()) as never,
      spaceId: 'default',
      limit: 3,
    });

    expect(result.values).toHaveLength(3);
    expect(alertsClient.search).toHaveBeenCalledTimes(1);
  });

  it(`reads at most ${DETONATE_SWEEP_MAX_PAGES} pages and reports the scan as truncated`, async () => {
    let next = 1;
    const alertsClient = {
      search: jest
        .fn()
        .mockImplementation(async () =>
          page(Array.from({ length: DETONATE_SWEEP_PAGE_SIZE }, () => alertHit(next++)))
        ),
    };
    const resultsClient = {
      mget: jest.fn().mockImplementation(async ({ ids }: { ids: string[] }) => ({
        docs: ids.map((_id) => ({
          _id,
          found: true,
          _source: {
            'detonate.doc_kind': 'alert_decision',
            'detonate.decision.state': 'verdict_applied',
          },
        })),
      })),
      search: jest.fn().mockResolvedValue({
        aggregations: { by_alert: { buckets: [] }, by_hash: { buckets: [] } },
      }),
    };

    const result = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClient as never,
      spaceId: 'default',
      limit: 5,
    });

    expect(alertsClient.search).toHaveBeenCalledTimes(DETONATE_SWEEP_MAX_PAGES + 1);
    expect(alertsClient.search.mock.calls[DETONATE_SWEEP_MAX_PAGES][0].size).toBe(1);
    expect(result.values).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.scanned).toBe(DETONATE_SWEEP_MAX_PAGES * DETONATE_SWEEP_PAGE_SIZE);
  });

  it('reports an exhaustive scan when the one-hit probe past the bound is empty', async () => {
    const decided = new Set<string>();
    const pages = Array.from({ length: DETONATE_SWEEP_MAX_PAGES }, (_page, i) =>
      page(
        Array.from({ length: DETONATE_SWEEP_PAGE_SIZE }, (_, j) => {
          const hit = alertHit(i * DETONATE_SWEEP_PAGE_SIZE + j + 1);
          decided.add(hit._id);
          return hit;
        })
      )
    );
    const alertsClient = { search: jest.fn() };
    pages.forEach((p) => alertsClient.search.mockResolvedValueOnce(p));
    alertsClient.search.mockResolvedValueOnce(page([])); // the probe

    const result = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClientDeciding(decided) as never,
      spaceId: 'default',
      limit: 5,
    });

    expect(alertsClient.search).toHaveBeenCalledTimes(DETONATE_SWEEP_MAX_PAGES + 1);
    expect(result.truncated).toBe(false);
  });

  it('never calls the results store with an empty id list when a page yields nothing fresh', async () => {
    // No hash on this page is a valid sha256, so `fresh` is empty and
    // `getAlertOutcomes` must skip its mget rather than hand ES an empty ids
    // array.
    const alertsClient = {
      search: jest
        .fn()
        .mockResolvedValue(page([alertHit(1, 'not-a-hash'), alertHit(2, 'also-not-a-hash')])),
    };
    const resultsClient = resultsClientDeciding(new Set());

    const result = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClient as never,
      spaceId: 'default',
      limit: 10,
    });

    expect(result).toEqual({ values: [], scanned: 0, truncated: false });
    expect(resultsClient.mget).not.toHaveBeenCalled();
    expect(resultsClient.search).not.toHaveBeenCalled();
  });

  it('filters on the space, open status and requested severities', async () => {
    const alertsClient = { search: jest.fn().mockResolvedValue(page([])) };

    await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClientDeciding(new Set()) as never,
      spaceId: 'blue',
      severities: ['high', 'critical'],
      limit: 5,
    });

    const [[request]] = alertsClient.search.mock.calls;
    expect(request.index).toBe('.alerts-security.alerts-blue');
    expect(request.query.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { 'kibana.space_ids': 'blue' } },
        { term: { 'kibana.alert.workflow_status': 'open' } },
        { terms: { 'kibana.alert.severity': ['high', 'critical'] } },
      ])
    );
  });

  it('maps a forbidden alerts read to a 403', async () => {
    const alertsClient = {
      search: jest.fn().mockRejectedValue({ statusCode: 403 }),
    };

    const error = await listSweepCandidates({
      alertsClient: alertsClient as never,
      resultsClient: resultsClientDeciding(new Set()) as never,
      spaceId: 'default',
      limit: 5,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DetonateServiceError);
    expect((error as DetonateServiceError).statusCode).toBe(403);
  });
});
