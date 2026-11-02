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

const FAST = { pollIntervalMs: 1, pollMaxWaitMs: 200 };

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
      (c) => c.path === '/internal/kibana/settings' && c.method === 'POST'
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
    expect(result.error).toContain('generate HTTP 400');
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
});
