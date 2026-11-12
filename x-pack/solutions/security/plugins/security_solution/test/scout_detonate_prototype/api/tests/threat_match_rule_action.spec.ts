/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture } from '@kbn/scout-security';
import { apiTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import type { WorkflowExecutionDto } from '@kbn/workflows';
import { isTerminalStatus } from '@kbn/workflows';

const ACTION_ID = 'system-security-detonate-action-create-threat-match-rule';
const RUN = Date.now();
const LISTS_VERSION = { 'elastic-api-version': '2023-10-31' };

const BASE_HEADERS = {
  'kbn-xsrf': 'scout',
  'x-elastic-internal-origin': 'kibana',
  'Content-Type': 'application/json;charset=UTF-8',
};

const listIds = (candidateId: string) =>
  ['domains', 'ips', 'hashes'].map((family) => `detonate-ioc-${family}-${candidateId}`);

const actionInput = (candidateId: string, ips: string[]) => ({
  candidate_id: candidateId,
  sample_label: '0123456789ab',
  task_id: `scout-${RUN}`,
  iocs: { domains: ['evil.example.com'], ips, hashes: ['a'.repeat(64)] },
  rule: {
    type: 'threat_match',
    language: 'kuery',
    name: `Detonate IOC match scout ${candidateId}`,
    description: 'Scout: the threat match action creates lists and the rule as the caller.',
    query: '*:*',
    index: ['logs-*'],
    threat_query: '*:*',
    threat_language: 'kuery',
    threat_mapping: [
      { entries: [{ field: 'dns.question.name', type: 'mapping', value: 'keyword' }] },
      { entries: [{ field: 'destination.ip', type: 'mapping', value: 'ip' }] },
      { entries: [{ field: 'file.hash.sha256', type: 'mapping', value: 'keyword' }] },
    ],
    interval: '24h',
    from: 'now-25h',
    severity: 'medium',
    risk_score: 47,
    tags: ['detonate:trial', `detonate-candidate:${candidateId}`],
  },
});

const runAction = async (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  input: unknown
): Promise<WorkflowExecutionDto> => {
  const run = await apiClient.post(`api/workflows/workflow/${ACTION_ID}/run`, {
    headers,
    responseType: 'json',
    body: { inputs: { actionInput: input } },
  });
  expect(run.statusCode).toBe(200);
  const { workflowExecutionId } = run.body as { workflowExecutionId: string };
  const deadline = Date.now() + 120_000;
  for (;;) {
    const res = await apiClient.get(
      `api/workflows/executions/${workflowExecutionId}?includeOutput=true`,
      { headers, responseType: 'json' }
    );
    expect(res.statusCode).toBe(200);
    const execution = res.body as WorkflowExecutionDto;
    if (isTerminalStatus(execution.status)) return execution;
    if (Date.now() > deadline) throw new Error(`Action still ${execution.status} after 120s`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

const listStatus = async (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  id: string
): Promise<number> =>
  (
    await apiClient.get(`api/lists?id=${encodeURIComponent(id)}`, {
      headers: { ...headers, ...LISTS_VERSION },
      responseType: 'json',
    })
  ).statusCode;

const findRules = async (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  candidateId: string
) => {
  const filter = encodeURIComponent(`alert.attributes.tags:"detonate-candidate:${candidateId}"`);
  const res = await apiClient.get(`api/detection_engine/rules/_find?filter=${filter}`, {
    headers: { ...headers, 'elastic-api-version': '2023-10-31' },
    responseType: 'json',
  });
  expect(res.statusCode).toBe(200);
  return (res.body as { data: Array<Record<string, unknown>> }).data;
};

/**
 * The Detonate threat match action, run directly as the approver the proposal gate would run it
 * as. The IOC worker writes nothing before approval, so this action is the only writer of the
 * value lists: it must create and load them, scope the rule to them itself, and leave no lists
 * behind when a load does not verify.
 */
apiTest.describe(
  'Detonate - create indicator match rule action',
  { tag: [...tags.stateful.classic] },
  () => {
    let headers: Record<string, string>;
    const created: string[] = [];

    apiTest.beforeAll(async ({ samlAuth, apiClient }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      headers = { ...BASE_HEADERS, ...cookieHeader };
      const index = await apiClient.post('api/lists/index', {
        headers: { ...headers, ...LISTS_VERSION },
        responseType: 'json',
      });
      expect([200, 409]).toContain(index.statusCode);
    });

    apiTest.afterAll(async ({ apiClient }) => {
      for (const id of created.flatMap(listIds)) {
        await apiClient.delete(`api/lists?id=${encodeURIComponent(id)}&deleteReferences=true`, {
          headers: { ...headers, ...LISTS_VERSION },
        });
      }
      for (const candidateId of created) {
        for (const rule of await findRules(apiClient, headers, candidateId)) {
          await apiClient.delete(`api/detection_engine/rules?id=${rule.id}`, {
            headers: { ...headers, 'elastic-api-version': '2023-10-31' },
          });
        }
      }
    });

    apiTest('creates the lists and an enabled rule scoped to them', async ({ apiClient }) => {
      const candidateId = `ok-${RUN}`;
      created.push(candidateId);

      const execution = await runAction(
        apiClient,
        headers,
        actionInput(candidateId, ['203.0.113.7'])
      );
      expect(execution.status).toBe('completed');

      for (const id of listIds(candidateId)) {
        expect(await listStatus(apiClient, headers, id)).toBe(200);
      }
      const [rule, ...rest] = await findRules(apiClient, headers, candidateId);
      expect(rest).toHaveLength(0);
      expect(rule).toMatchObject({
        type: 'threat_match',
        enabled: true,
        threat_index: ['.items-default'],
        threat_filters: [{ query: { terms: { list_id: listIds(candidateId) } } }],
      });
    });

    // `999.1.1.1` passes the input pattern but not the ip list type, so the
    // count check sees 0 of 1 IPs loaded.
    apiTest('deletes the lists and fails when a family does not load', async ({ apiClient }) => {
      const candidateId = `bad-${RUN}`;
      created.push(candidateId);

      const execution = await runAction(
        apiClient,
        headers,
        actionInput(candidateId, ['999.1.1.1'])
      );
      expect(execution.status).toBe('failed');
      expect(JSON.stringify(execution.error)).toContain('did not load completely');

      for (const id of listIds(candidateId)) {
        expect(await listStatus(apiClient, headers, id)).toBe(404);
      }
      expect(await findRules(apiClient, headers, candidateId)).toHaveLength(0);
    });

    // Input validation fails the execution before any step runs.
    apiTest(
      'fails an input that sets the indicator filter, writing nothing',
      async ({ apiClient }) => {
        const candidateId = `inj-${RUN}`;
        created.push(candidateId);
        const input = actionInput(candidateId, ['203.0.113.7']);

        const execution = await runAction(apiClient, headers, {
          ...input,
          rule: { ...input.rule, threat_filters: [] },
        });
        expect(execution.status).toBe('failed');
        expect(execution.stepExecutions).toHaveLength(0);
        for (const id of listIds(candidateId)) {
          expect(await listStatus(apiClient, headers, id)).toBe(404);
        }
      }
    );
  }
);
