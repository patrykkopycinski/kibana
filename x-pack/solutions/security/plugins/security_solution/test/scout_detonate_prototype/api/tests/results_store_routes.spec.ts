/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, EsClient } from '@kbn/scout-security';
import { apiTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';

const API = 'internal/detonate_prototype';
const RESULTS_INDEX = '.kibana-detonate-results-default';
const ALERTS_INDEX = '.alerts-security.alerts-default';
const RUN = Date.now();
const probe = (name: string) => `detonate-probe-${name}-${RUN}`;
const sha = (char: string) => char.repeat(64);

/** Older than any real run, so the oldest-first handoff list reaches the probes first. */
const OLD = '2001-01-01T00:00:00.000Z';
const TRANSIENT_TTL_MS = 2 * 60 * 60 * 1000;

const BASE_HEADERS = {
  'kbn-xsrf': 'scout',
  'x-elastic-internal-origin': 'kibana',
  'elastic-api-version': '1',
  'Content-Type': 'application/json;charset=UTF-8',
};

interface Outcome {
  state: string;
  verdict?: string;
  task_id?: string;
}

const runDoc = (
  taskId: string,
  fields: { alertId: string; state: string; sha256?: string; verdict?: string; origin?: boolean }
) => ({
  '@timestamp': OLD,
  'detonate.doc_kind': 'run',
  'detonate.task_id': taskId,
  'detonate.alert_id': fields.alertId,
  'detonate.state': fields.state,
  'detonate.space_id': 'default',
  ...(fields.verdict ? { 'detonate.verdict': fields.verdict } : {}),
  ...(fields.sha256 ? { 'file.hash.sha256': fields.sha256 } : {}),
  ...(fields.origin ? { 'detonate.origin.alert_ids': [fields.alertId] } : {}),
});

/**
 * The results-store routes the Detonate workflows call: per-alert decisions, the
 * outcomes a sweep reads to skip alerts, and the run handoff markers. Run and alert
 * documents are seeded directly; every one is named `detonate-probe-*` and removed.
 */
apiTest.describe('Detonate results store routes', { tag: [...tags.stateful.classic] }, () => {
  let headers: Record<string, string>;
  const resultIds: string[] = [];
  const alertIds: string[] = [];

  const seedAlert = async (esClient: EsClient, id: string, spaceId = 'default') => {
    alertIds.push(id);
    await esClient.index({
      index: ALERTS_INDEX,
      id,
      op_type: 'create',
      refresh: 'wait_for',
      document: {
        '@timestamp': new Date().toISOString(),
        'kibana.alert.workflow_status': 'open',
        'kibana.space_ids': [spaceId],
      },
    });
  };

  const seedResult = async (esClient: EsClient, id: string, document: object) => {
    resultIds.push(id);
    await esClient.index({ index: RESULTS_INDEX, id, refresh: 'wait_for', document });
  };

  const post = (apiClient: ApiClientFixture, path: string, body: unknown) =>
    apiClient.post(`${API}/${path}`, { headers, responseType: 'json', body });

  const decide = async (apiClient: ApiClientFixture, decisions: object[]) => {
    const res = await post(apiClient, 'decisions', { decisions });
    decisions.forEach((decision) => resultIds.push((decision as { alert_id: string }).alert_id));
    return res;
  };

  const outcomes = async (
    apiClient: ApiClientFixture,
    body: object
  ): Promise<Record<string, Outcome>> => {
    const res = await post(apiClient, 'alert_outcomes', body);
    expect(res).toHaveStatusCode(200);
    return (res.body as { outcomes: Record<string, Outcome> }).outcomes;
  };

  const handoffTasks = async (apiClient: ApiClientFixture, marker: string) => {
    const res = await apiClient.get(`${API}/handoffs?marker=${marker}`, {
      headers,
      responseType: 'json',
    });
    expect(res).toHaveStatusCode(200);
    return (res.body as { handoffs: Array<{ task_id: string }> }).handoffs.map(
      ({ task_id: taskId }) => taskId
    );
  };

  apiTest.beforeAll(async ({ samlAuth, apiClient }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
    headers = { ...BASE_HEADERS, ...cookieHeader };
    // Creates the alerts index when this cluster has never run a rule.
    const index = await apiClient.post('api/detection_engine/index', {
      headers: { ...headers, 'elastic-api-version': '2023-10-31' },
      responseType: 'json',
    });
    expect(index).toHaveStatusCode(200);
  });

  apiTest.afterAll(async ({ esClient }) => {
    const cleanup = async (index: string, ids: string[]) => {
      if (ids.length === 0) return;
      await esClient.deleteByQuery(
        { index, query: { ids: { values: ids } }, refresh: true, conflicts: 'proceed' },
        { ignore: [404] }
      );
    };
    await cleanup(RESULTS_INDEX, [...new Set(resultIds)]);
    await cleanup(ALERTS_INDEX, alertIds);
  });

  apiTest('rejects malformed request bodies', async ({ apiClient }) => {
    const alertId = probe('malformed');
    const rejected = [
      await post(apiClient, 'decisions', { decisions: [] }),
      await post(apiClient, 'decisions', {
        decisions: [{ alert_id: alertId, state: 'verdict_applied' }],
      }),
      await post(apiClient, 'decisions', {
        decisions: [{ alert_id: alertId, state: 'skipped', sha256: 'not-a-hash' }],
      }),
      await post(apiClient, 'decisions', { decisions: [{ alert_id: alertId, state: 'done' }] }),
      await post(apiClient, 'alert_outcomes', {}),
      await post(apiClient, 'alert_outcomes', {
        alert_ids: Array.from({ length: 150 }, (_, i) => `${alertId}-a${i}`),
        alerts: Array.from({ length: 51 }, (_, i) => ({ alert_id: `${alertId}-b${i}` })),
      }),
      await post(apiClient, `runs/${probe('malformed-run')}/handoff`, {}),
      await post(apiClient, `runs/${probe('malformed-run')}/handoff`, {
        add: ['detonate:hunt-unknown'],
      }),
      await apiClient.get(`${API}/handoffs?marker=triage`, { headers, responseType: 'json' }),
    ];
    rejected.forEach((res) => expect(res).toHaveStatusCode(400));
  });

  apiTest(
    'refuses a decision for an alert the caller cannot read in this space',
    async ({ apiClient, esClient }) => {
      const otherSpace = probe('other-space-alert');
      await seedAlert(esClient, otherSpace, 'detonate-probe-space');

      for (const alertId of [probe('missing-alert'), otherSpace]) {
        const res = await post(apiClient, 'decisions', {
          decisions: [{ alert_id: alertId, state: 'skipped' }],
        });
        expect(res).toHaveStatusCode(403);
        expect((res.body as { message: string }).message).toContain(alertId);
      }

      const stored = await esClient.mget({ index: RESULTS_INDEX, ids: [otherSpace] });
      expect(stored.docs.every((doc) => !('found' in doc) || !doc.found)).toBe(true);
    }
  );

  apiTest(
    'keeps a terminal decision over later claims and releases',
    async ({ apiClient, esClient }) => {
      const alertId = probe('lifecycle');
      await seedAlert(esClient, alertId);
      const read = async () => (await outcomes(apiClient, { alert_ids: [alertId] }))[alertId];

      expect(
        (await decide(apiClient, [{ alert_id: alertId, state: 'queued' }])).body
      ).toStrictEqual({
        written: 1,
      });
      expect(await read()).toStrictEqual({ state: 'queued' });

      await decide(apiClient, [{ alert_id: alertId, state: 'released' }]);
      expect(await read()).toBeUndefined();

      await decide(apiClient, [
        { alert_id: alertId, state: 'skipped', reason: 'probe', task_id: probe('task') },
      ]);
      expect(await read()).toStrictEqual({ state: 'skipped', task_id: probe('task') });

      await decide(apiClient, [{ alert_id: alertId, state: 'running' }]);
      await decide(apiClient, [{ alert_id: alertId, state: 'released' }]);
      expect(await read()).toStrictEqual({ state: 'skipped', task_id: probe('task') });

      // A terminal decision replaces the whole document, so the old task id goes.
      await decide(apiClient, [{ alert_id: alertId, state: 'verdict_applied', verdict: 'benign' }]);
      expect(await read()).toStrictEqual({ state: 'verdict_applied', verdict: 'benign' });
    }
  );

  apiTest(
    'writes one document per alert when a batch repeats it, last entry wins',
    async ({ apiClient, esClient }) => {
      const alertId = probe('dedupe');
      await seedAlert(esClient, alertId);

      const res = await decide(apiClient, [
        { alert_id: alertId, state: 'queued' },
        { alert_id: alertId, state: 'verdict_applied', verdict: 'malicious', sha256: sha('A') },
      ]);
      expect(res).toHaveStatusCode(200);
      expect(res.body).toStrictEqual({ written: 1 });

      const stored = await esClient.get<Record<string, unknown>>({
        index: RESULTS_INDEX,
        id: alertId,
      });
      expect(stored._source).toMatchObject({
        'detonate.doc_kind': 'alert_decision',
        'detonate.decision.state': 'verdict_applied',
        'detonate.verdict': 'malicious',
        'file.hash.sha256': sha('a'),
      });
    }
  );

  apiTest(
    'stops excluding a claim older than the transient TTL',
    async ({ apiClient, esClient }) => {
      const fresh = probe('claim-fresh');
      const stale = probe('claim-stale');
      const claim = (alertId: string, timestamp: string) => ({
        '@timestamp': timestamp,
        'detonate.doc_kind': 'alert_decision',
        'detonate.alert_id': alertId,
        'detonate.decision.state': 'running',
        'detonate.space_id': 'default',
      });
      await seedResult(esClient, fresh, claim(fresh, new Date().toISOString()));
      await seedResult(
        esClient,
        stale,
        claim(stale, new Date(Date.now() - TRANSIENT_TTL_MS - 60_000).toISOString())
      );

      const result = await outcomes(apiClient, { alert_ids: [fresh, stale] });
      expect(result[fresh]).toStrictEqual({ state: 'running' });
      expect(result[stale]).toBeUndefined();
    }
  );

  apiTest(
    'reports completed runs by alert and by hash, and caps repeated failures',
    async ({ apiClient, esClient }) => {
      const done = probe('run-done-alert');
      const sibling = probe('run-sibling-alert');
      const badHash = probe('run-bad-hash-alert');
      const capped = probe('run-capped-alert');
      const twice = probe('run-twice-alert');
      const free = probe('run-free-alert');

      await seedResult(
        esClient,
        probe('run-done'),
        runDoc(probe('run-done'), {
          alertId: done,
          state: 'complete',
          verdict: 'malicious',
          sha256: sha('b'),
        })
      );
      for (const n of [1, 2, 3]) {
        await seedResult(
          esClient,
          probe(`run-capped-${n}`),
          runDoc(probe(`run-capped-${n}`), { alertId: capped, state: 'failed' })
        );
      }
      for (const n of [1, 2]) {
        await seedResult(
          esClient,
          probe(`run-twice-${n}`),
          runDoc(probe(`run-twice-${n}`), { alertId: twice, state: 'failed' })
        );
      }

      const result = await outcomes(apiClient, {
        alert_ids: [done, capped, twice, free],
        alerts: [
          { alert_id: sibling, sha256: sha('B') },
          // A malformed hash costs this alert its hash, not the whole batch a 400.
          { alert_id: badHash, sha256: 'not-a-hash' },
        ],
      });

      const completed = { state: 'completed', verdict: 'malicious', task_id: probe('run-done') };
      expect(result[done]).toStrictEqual(completed);
      expect(result[sibling]).toStrictEqual(completed);
      expect(result[capped]).toStrictEqual({ state: 'retry_capped' });
      expect(result[badHash]).toBeUndefined();
      expect(result[twice]).toBeUndefined();
      expect(result[free]).toBeUndefined();
    }
  );

  apiTest(
    'lists malicious runs for each Worker until their markers finish them',
    async ({ apiClient, esClient }) => {
      const taskId = probe('handoff-run');
      await seedResult(
        esClient,
        taskId,
        runDoc(taskId, {
          alertId: probe('handoff-alert'),
          state: 'complete',
          verdict: 'malicious',
          sha256: sha('c'),
          origin: true,
        })
      );
      const mark = async (body: object) => {
        const res = await post(apiClient, `runs/${taskId}/handoff`, body);
        expect(res).toHaveStatusCode(200);
        expect(res.body).toStrictEqual({ updated: 1 });
      };

      expect(await handoffTasks(apiClient, 'hunt')).toContain(taskId);
      expect(await handoffTasks(apiClient, 'coverage')).toContain(taskId);

      await mark({ add: ['detonate:hunt-done'] });
      expect(await handoffTasks(apiClient, 'hunt')).not.toContain(taskId);

      // An explicit re-request beats an earlier `done`.
      await mark({ add: ['detonate:hunt-requested'] });
      expect(await handoffTasks(apiClient, 'hunt')).toContain(taskId);

      await mark({ add: ['detonate:coverage-in-progress'] });
      expect(await handoffTasks(apiClient, 'coverage')).not.toContain(taskId);

      await mark({
        remove: ['detonate:coverage-in-progress'],
        add: ['detonate:coverage-reviewed'],
      });
      expect(await handoffTasks(apiClient, 'coverage')).not.toContain(taskId);

      const stored = await esClient.get<Record<string, unknown>>({
        index: RESULTS_INDEX,
        id: taskId,
      });
      expect(stored._source?.['detonate.handoff.hunt']).toStrictEqual(['done', 'requested']);
      expect(stored._source?.['detonate.handoff.coverage']).toStrictEqual(['reviewed']);
    }
  );

  apiTest('answers 404 for a run with no results document', async ({ apiClient }) => {
    const res = await post(apiClient, `runs/${probe('missing-run')}/handoff`, {
      add: ['detonate:hunt-done'],
    });
    expect(res).toHaveStatusCode(404);
  });
});
