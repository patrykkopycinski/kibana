/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { AttackDiscoveryWorkflowApiClient } from './attack_discovery_workflow_api_client';

const log = { debug: jest.fn(), info: jest.fn(), warning: jest.fn() } as unknown as ToolingLog;

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

interface Call {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}

type Responder = (call: Call) => unknown;

const createFetch = (responders: Record<string, Responder>) => {
  const calls: Call[] = [];
  const fetch = jest.fn(async (path: string, options?: { method?: string; body?: string }) => {
    const call: Call = {
      path,
      method: options?.method ?? 'GET',
      body: options?.body ? JSON.parse(options.body) : undefined,
    };
    calls.push(call);
    const key = Object.keys(responders).find((pattern) => path.includes(pattern));
    if (!key) throw httpError(404);
    const result = responders[key](call);
    if (result instanceof Error) throw result;
    return result;
  });
  return { fetch: fetch as unknown as HttpHandler, calls };
};

const FAST = {
  pollIntervalMs: 1,
  pollMaxWaitMs: 200,
  reportGraceMs: 10,
  reportMaxWaitMs: 100,
};

const settingsOk = { '/internal/kibana/settings': () => ({ settings: {} }) };

describe('AttackDiscoveryWorkflowApiClient', () => {
  it('posts the internal generate route with snake_case body and workflow_config passthrough', async () => {
    const { fetch, calls } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
      '/tracking': () => ({ generation: null, validation: null }),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, {
      pollIntervalMs: 1,
      pollMaxWaitMs: 20,
    });

    await client.generate({
      connectorId: 'c-1',
      actionTypeId: '.inference',
      modelId: 'm-1',
      alertsIndexPattern: '.alerts-x',
      size: 50,
      start: 's',
      end: 'e',
      workflowConfig: { ground_truth_gate_enabled: true },
    });

    const generate = calls.find((c) => c.path === '/internal/attack_discovery/_generate');
    expect(generate?.method).toBe('POST');
    expect(generate?.body).toEqual({
      alerts_index_pattern: '.alerts-x',
      api_config: { connector_id: 'c-1', action_type_id: '.inference', model: 'm-1' },
      size: 50,
      start: 's',
      end: 'e',
      workflow_config: { ground_truth_gate_enabled: true },
    });
  });

  it('omits workflow_config when none is given', async () => {
    const { fetch, calls } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
      '/tracking': () => ({}),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, {
      pollIntervalMs: 1,
      pollMaxWaitMs: 20,
    });

    await client.generate({ connectorId: 'c-1' });

    const generate = calls.find((c) => c.path === '/internal/attack_discovery/_generate');
    expect(generate?.body).not.toHaveProperty('workflow_config');
  });

  it('enables the Attack Discovery workflows setting once before generating', async () => {
    const { fetch, calls } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
      '/tracking': () => ({}),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, {
      pollIntervalMs: 1,
      pollMaxWaitMs: 5,
    });

    await client.generate({ connectorId: 'c-1' });
    await client.generate({ connectorId: 'c-1' });

    const settingsWrites = calls.filter(
      (c) =>
        c.path === '/internal/kibana/settings' &&
        c.method === 'POST' &&
        'securitySolution:enableAttackDiscoveryWorkflows' in (c.body?.changes as object)
    );
    expect(settingsWrites).toHaveLength(1);
    expect(settingsWrites[0].body).toEqual({
      changes: { 'securitySolution:enableAttackDiscoveryWorkflows': true },
    });
    expect(calls[0].path).toBe('/internal/kibana/settings');
  });

  it('returns discoveries and workflow run ids once validation reaches a terminal status', async () => {
    let trackingCalls = 0;
    const { fetch } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
      '/executions/exec-1/tracking': () => {
        trackingCalls += 1;
        if (trackingCalls === 1) throw httpError(404);
        if (trackingCalls === 2) {
          return {
            alert_retrieval: [{ workflow_id: 'wf-r', workflow_run_id: 'run-r' }],
            gate: [{ workflow_id: 'wf-g', workflow_run_id: 'run-g' }],
            generation: { workflow_id: 'wf-gen', workflow_run_id: 'run-gen' },
            validation: { workflow_id: 'wf-v', workflow_run_id: 'run-v' },
          };
        }
        return {
          alert_retrieval: [{ workflow_id: 'wf-r', workflow_run_id: 'run-r' }],
          gate: [{ workflow_id: 'wf-g', workflow_run_id: 'run-g' }],
          generation: { workflow_id: 'wf-gen', workflow_run_id: 'run-gen' },
          validation: { workflow_id: 'wf-v', workflow_run_id: 'run-v' },
        };
      },
      '/api/workflows/executions/run-v': () => ({ status: 'completed' }),
      '/internal/attack_discovery/workflow/wf-gen/execution/exec-1': () => ({
        validated_discoveries: [
          {
            title: 'T',
            summary_markdown: 'S',
            details_markdown: 'D',
            entity_summary_markdown: 'E',
            alert_ids: ['a1'],
          },
        ],
      }),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

    const result = await client.generate({ connectorId: 'c-1' });

    expect(result.status).toBe('succeeded');
    expect(result.error).toBeUndefined();
    expect(result.executionUuid).toBe('exec-1');
    expect(result.discoveries).toEqual([
      {
        title: 'T',
        summaryMarkdown: 'S',
        detailsMarkdown: 'D',
        entitySummaryMarkdown: 'E',
        alertIds: ['a1'],
      },
    ]);
    expect(result.workflowRuns).toEqual({
      alertRetrieval: ['run-r'],
      gate: ['run-g'],
      generation: 'run-gen',
      validation: 'run-v',
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.startedAt).toISOString()).toBe(result.startedAt);
  });

  it('reports failure when a tracked workflow run ends failed', async () => {
    const { fetch } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
      '/executions/exec-1/tracking': () => ({
        gate: [{ workflow_id: 'wf-g', workflow_run_id: 'run-g' }],
        generation: null,
        validation: null,
      }),
      '/api/workflows/executions/run-g': () => ({ status: 'failed' }),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

    const result = await client.generate({ connectorId: 'c-1' });

    expect(result.status).toBe('failed');
    expect(result.discoveries).toEqual([]);
    expect(result.error).toContain('run-g');
    expect(result.error).toContain('failed');
  });

  it.each(['timed_out', 'skipped', 'cancelled'])(
    'ends the poll promptly as failed when a tracked workflow run ends %s',
    async (runStatus) => {
      const { fetch, calls } = createFetch({
        ...settingsOk,
        '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
        '/executions/exec-1/tracking': () => ({
          gate: [{ workflow_id: 'wf-g', workflow_run_id: 'run-g' }],
          generation: null,
          validation: null,
        }),
        '/api/workflows/executions/run-g': () => ({ status: runStatus }),
      });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, {
        ...FAST,
        pollMaxWaitMs: 30_000,
      });

      const startedAt = Date.now();
      const result = await client.generate({ connectorId: 'c-1' });

      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('run-g');
      expect(result.error).toContain(runStatus);
      expect(calls.filter((c) => c.path.includes('/api/workflows/executions/run-g'))).toHaveLength(
        1
      );
    }
  );

  it('times out when validation never becomes terminal', async () => {
    const { fetch } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
      '/executions/exec-1/tracking': () => ({
        generation: { workflow_id: 'wf-gen', workflow_run_id: 'run-gen' },
        validation: { workflow_id: 'wf-v', workflow_run_id: 'run-v' },
      }),
      '/api/workflows/executions/': () => ({ status: 'running' }),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, {
      pollIntervalMs: 1,
      pollMaxWaitMs: 30,
    });

    const result = await client.generate({ connectorId: 'c-1' });

    expect(result.status).toBe('timed_out');
    expect(result.error).toContain('timed out');
    expect(result.workflowRuns.generation).toBe('run-gen');
  });

  it('fails immediately on a permanent tracking error', async () => {
    const { fetch, calls } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
      '/executions/exec-1/tracking': () => httpError(403),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

    const result = await client.generate({ connectorId: 'c-1' });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('403');
    expect(calls.filter((c) => c.path.includes('/tracking'))).toHaveLength(1);
  });

  it('fails when the generate route rejects the request', async () => {
    const { fetch } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => httpError(400),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

    const result = await client.generate({ connectorId: 'c-1' });

    expect(result.status).toBe('failed');
    expect(result.executionUuid).toBe('');
    expect(result.error).toContain('HTTP 400');
  });

  it('fails when the generate response has no execution_uuid', async () => {
    const { fetch } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => ({}),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

    const result = await client.generate({ connectorId: 'c-1' });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('execution_uuid');
  });

  describe('token usage tracking setting', () => {
    const TRACKING = 'genAiSettings:tokenUsageTracking';

    const runWith = async (
      settings: (call: Call) => unknown,
      extra: Record<string, Responder> = {}
    ) => {
      const { fetch, calls } = createFetch({
        '/internal/kibana/settings': settings,
        '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
        '/tracking': () => ({}),
        ...extra,
      });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, {
        pollIntervalMs: 1,
        pollMaxWaitMs: 5,
      });
      const result = await client.generate({ connectorId: 'c-1' });
      return { result, calls };
    };

    it('reports enabled without writing when the setting is already true', async () => {
      const { result, calls } = await runWith(() => ({
        settings: { [TRACKING]: { userValue: true } },
      }));

      expect(result.tokenUsageTrackingEnabled).toBe(true);
      expect(
        calls.filter((c) => c.method === 'POST' && TRACKING in ((c.body?.changes as object) ?? {}))
      ).toHaveLength(0);
    });

    it('reports enabled without writing when the setting is a read-only override that is on', async () => {
      const { result, calls } = await runWith(() => ({
        settings: { [TRACKING]: { userValue: true, isOverridden: true } },
      }));

      expect(result.tokenUsageTrackingEnabled).toBe(true);
      expect(
        calls.filter((c) => c.method === 'POST' && c.path === '/internal/kibana/settings')
      ).toHaveLength(1); // only the workflows setting write
      expect(
        calls.filter((c) => c.method === 'POST' && TRACKING in ((c.body?.changes as object) ?? {}))
      ).toHaveLength(0);
    });

    it('sets the setting when it is off and re-reads it', async () => {
      let tracking = false;
      const { result, calls } = await runWith((call) => {
        if (call.method === 'POST') {
          if (TRACKING in (call.body?.changes as object)) tracking = true;
          return {};
        }
        return { settings: { [TRACKING]: { userValue: tracking } } };
      });

      expect(result.tokenUsageTrackingEnabled).toBe(true);
      const write = calls.find(
        (c) => c.method === 'POST' && TRACKING in ((c.body?.changes as object) ?? {})
      );
      expect(write?.body).toEqual({ changes: { [TRACKING]: true } });
    });

    it('reports disabled, without throwing, when the setting is an override and the write is rejected', async () => {
      const { result } = await runWith((call) => {
        if (call.method === 'POST' && TRACKING in ((call.body?.changes as object) ?? {})) {
          return httpError(400);
        }
        if (call.method === 'POST') return {};
        return { settings: { [TRACKING]: { userValue: false, isOverridden: true } } };
      });

      expect(result.tokenUsageTrackingEnabled).toBe(false);
      expect(result.status).not.toBe('failed');
      expect(result.executionUuid).toBe('exec-1');
    });

    it('reports disabled when the re-read still says off after a write that did not fail', async () => {
      const { result } = await runWith((call) =>
        call.method === 'POST' ? {} : { settings: { [TRACKING]: { userValue: false } } }
      );

      expect(result.tokenUsageTrackingEnabled).toBe(false);
    });

    it('reports disabled, without throwing, when reading the setting fails', async () => {
      const { result } = await runWith((call) => (call.method === 'POST' ? {} : httpError(500)));

      expect(result.tokenUsageTrackingEnabled).toBe(false);
    });
  });

  describe('report workflow run wait', () => {
    const REPORT_LIST = '/api/workflows/workflow/system-attack-discovery-skill-report/executions';

    const succeededPipeline = (extra: Record<string, Responder>) =>
      createFetch({
        ...settingsOk,
        '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
        '/executions/exec-1/tracking': () => ({
          generation: { workflow_id: 'wf-gen', workflow_run_id: 'run-gen' },
          validation: { workflow_id: 'wf-v', workflow_run_id: 'run-v' },
        }),
        '/api/workflows/executions/run-': () => ({ status: 'completed' }),
        '/internal/attack_discovery/workflow/wf-gen/execution/exec-1': () => ({
          validated_discoveries: [],
        }),
        ...extra,
      });

    it('waits until the report run is terminal, listing runs started at or after startedAt', async () => {
      let listCalls = 0;
      const { fetch, calls } = succeededPipeline({
        [REPORT_LIST]: () => {
          listCalls += 1;
          return {
            results: [{ id: 'report-1', status: listCalls < 3 ? 'running' : 'completed' }],
          };
        },
      });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

      const result = await client.generate({ connectorId: 'c-1' });

      expect(listCalls).toBe(3);
      expect(result.reportRunId).toBe('report-1');
      expect(result.reportRunStatus).toBe('completed');
      const listCall = calls.find((c) => c.path.startsWith(REPORT_LIST));
      expect(listCall?.path).toContain(`startedAfter=${encodeURIComponent(result.startedAt)}`);
    });

    it('proceeds with status none when no report run appears within the grace period', async () => {
      let listCalls = 0;
      const { fetch } = succeededPipeline({
        [REPORT_LIST]: () => {
          listCalls += 1;
          return { results: [] };
        },
      });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

      const result = await client.generate({ connectorId: 'c-1' });

      expect(listCalls).toBeGreaterThan(1);
      expect(result.status).toBe('succeeded');
      expect(result.reportRunStatus).toBe('none');
      expect(result.reportRunId).toBeUndefined();
    });

    it('stops at the cap with status wait_timed_out when the report run never becomes terminal', async () => {
      const { fetch } = succeededPipeline({
        [REPORT_LIST]: () => ({ results: [{ id: 'report-1', status: 'running' }] }),
      });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

      const result = await client.generate({ connectorId: 'c-1' });

      expect(result.status).toBe('succeeded');
      expect(result.reportRunId).toBe('report-1');
      expect(result.reportRunStatus).toBe('wait_timed_out');
    });

    it('retries a transient list error and reports the terminal run', async () => {
      let listCalls = 0;
      const { fetch } = succeededPipeline({
        [REPORT_LIST]: () => {
          listCalls += 1;
          return listCalls === 1
            ? httpError(503)
            : { results: [{ id: 'report-1', status: 'completed' }] };
        },
      });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

      const result = await client.generate({ connectorId: 'c-1' });

      expect(listCalls).toBe(2);
      expect(result.reportRunId).toBe('report-1');
      expect(result.reportRunStatus).toBe('completed');
    });

    it('skips the wait without throwing on a permanent list error', async () => {
      const { fetch } = succeededPipeline({ [REPORT_LIST]: () => httpError(403) });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

      const result = await client.generate({ connectorId: 'c-1' });

      expect(result.status).toBe('succeeded');
      expect(result.reportRunStatus).toBe('unavailable');
    });

    it('does not wait for a report when generation failed', async () => {
      const { fetch, calls } = createFetch({
        ...settingsOk,
        '/internal/attack_discovery/_generate': () => ({ execution_uuid: 'exec-1' }),
        '/executions/exec-1/tracking': () => httpError(403),
      });
      const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

      const result = await client.generate({ connectorId: 'c-1' });

      expect(result.status).toBe('failed');
      expect(calls.some((c) => c.path.includes(REPORT_LIST))).toBe(false);
    });
  });

  it('uses the bare error message when a failure has no HTTP status', async () => {
    const { fetch } = createFetch({
      ...settingsOk,
      '/internal/attack_discovery/_generate': () => new Error('socket hang up'),
    });
    const client = new AttackDiscoveryWorkflowApiClient(fetch, log, FAST);

    const result = await client.generate({ connectorId: 'c-1' });

    expect(result.error).toContain('socket hang up');
    expect(result.error).not.toContain('n/a');
  });
});
