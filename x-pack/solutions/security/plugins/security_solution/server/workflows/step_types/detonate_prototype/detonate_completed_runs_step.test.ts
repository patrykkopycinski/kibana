/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateCompletedRunsStepDefinition } from './detonate_completed_runs_step';
import {
  DETONATE_ALERT_OUTCOMES_PATH,
  DETONATE_TASKS_PATH,
} from '../../../../common/detonate_prototype';
import type { DetonateAlertOutcomes, DetonateTask } from '../../../../common/detonate_prototype';

type HandlerContext = Parameters<typeof detonateCompletedRunsStepDefinition.handler>[0];

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: ['space:default'],
  sample_hash: 'a'.repeat(64),
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.0.0',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  exec_wait_secs: 30,
  pre_exec_commands: [],
  exec_commands: [],
  vm_has_internet: false,
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...overrides,
});

const run = (id: string, alertId: string | undefined, day: number, extra = {}) =>
  createTask({
    id,
    created_at: `2026-01-0${day}T00:00:00.000Z`,
    tags: ['space:default', ...(alertId ? [`alert:${alertId}`] : [])],
    ...extra,
  });

const maliciousRun = (id: string, alertId: string, day: number) =>
  run(id, alertId, day, {
    production_endpoint_alerts_count: 1,
    production_endpoint_alert_groups: [{ event_code: 'malicious_file', alerts_count: 1 }],
  });

const createMockContext = (
  tasks: DetonateTask[],
  outcomes: DetonateAlertOutcomes['outcomes'] = {},
  maxPending = 20
) => {
  const callKibanaApi = jest
    .fn()
    .mockResolvedValueOnce({ status: 200, body: { offset: 0, size: 200, tasks } })
    .mockResolvedValueOnce({ status: 200, body: { outcomes } });
  return {
    input: { max_pending: maxPending },
    contextManager: { callKibanaApi },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as HandlerContext;
};

const sweep = async (context: HandlerContext) => {
  const { output } = await detonateCompletedRunsStepDefinition.handler(context);
  if (!output) throw new Error('the step returned no output');
  return output;
};

const calls = (context: HandlerContext) =>
  (context.contextManager.callKibanaApi as jest.Mock).mock.calls.map(([args]) => args);

describe('detonateCompletedRunsStepDefinition', () => {
  it('lists runs through the tasks route at its page cap', async () => {
    const context = createMockContext([]);

    await detonateCompletedRunsStepDefinition.handler(context);

    expect(calls(context)[0]).toEqual({
      method: 'GET',
      path: `${DETONATE_TASKS_PATH}?size=200`,
      headers: { 'elastic-api-version': '1' },
    });
  });

  it('skips the alert read when no completed run names an alert', async () => {
    const context = createMockContext([run('t1', undefined, 1)]);

    const output = await sweep(context);

    expect(calls(context)).toHaveLength(1);
    expect(output).toEqual({
      completed_runs: 1,
      unlinked_runs: 1,
      already_applied: 0,
      deferred: 0,
      pending_count: 0,
      pending: [],
    });
  });

  it('reads the source alerts decisions through the outcomes route, not the alerts', async () => {
    const context = createMockContext([run('t1', 'alert-1', 1), run('t2', 'alert-2', 2)]);

    await detonateCompletedRunsStepDefinition.handler(context);

    expect(calls(context)[1]).toEqual({
      method: 'POST',
      path: DETONATE_ALERT_OUTCOMES_PATH,
      headers: { 'elastic-api-version': '1' },
      body: { alert_ids: ['alert-2', 'alert-1'] },
    });
  });

  it('ignores failed and unfinished runs', async () => {
    const context = createMockContext([
      run('failed', 'alert-1', 1, { last_worker_status: 'failure' }),
      run('running', 'alert-2', 2, { last_worker_name: 'detonate.workers.exec_sample' }),
    ]);

    const output = await sweep(context);

    expect(calls(context)).toHaveLength(1);
    expect(output).toMatchObject({ completed_runs: 0, pending_count: 0, pending: [] });
  });

  it('writes back the newest run of a re-detonated alert, with its verdict', async () => {
    const context = createMockContext(
      [run('older', 'alert-1', 1), maliciousRun('newer', 'alert-1', 3)],
      { 'alert-1': { state: 'completed', verdict: 'benign', task_id: 'older' } }
    );

    const output = await sweep(context);

    expect(output.pending_count).toBe(1);
    expect(output.pending[0]).toMatchObject({
      task_id: 'newer',
      alert_id: 'alert-1',
      sample_hash: 'a'.repeat(64),
      created_at: '2026-01-03T00:00:00.000Z',
      verdict: 'malicious',
    });
    expect(output.pending[0].evidence).toEqual(expect.any(String));
  });

  it('skips alerts whose verdict is already recorded', async () => {
    const context = createMockContext(
      [run('t1', 'applied', 1), run('t2', 'unseen', 2), run('t3', 'open', 3)],
      {
        applied: { state: 'verdict_applied', verdict: 'benign', task_id: 't1' },
        open: { state: 'completed', verdict: 'benign', task_id: 't3' },
      }
    );

    const output = await sweep(context);

    expect(output).toMatchObject({
      completed_runs: 3,
      already_applied: 1,
      pending_count: 2,
    });
    expect(output.pending.map(({ alert_id: alertId }) => alertId)).toEqual(['open', 'unseen']);
  });

  it('defers write-backs beyond max_pending to the next sweep, newest first', async () => {
    const context = createMockContext(
      [run('t1', 'alert-1', 1), run('t2', 'alert-2', 2), run('t3', 'alert-3', 3)],
      {},
      2
    );

    const output = await sweep(context);

    expect(output).toMatchObject({ pending_count: 2, deferred: 1 });
    expect(output.pending.map(({ task_id: taskId }) => taskId)).toEqual(['t3', 't2']);
  });

  it('propagates a failed run listing as an execution error', async () => {
    const context = createMockContext([]);
    (context.contextManager.callKibanaApi as jest.Mock)
      .mockReset()
      .mockRejectedValue(new Error('route blew up'));

    await expect(detonateCompletedRunsStepDefinition.handler(context)).rejects.toThrow(
      'route blew up'
    );
  });

  it('propagates a failed outcomes read rather than treating every alert as undecided', async () => {
    const context = createMockContext([run('t1', 'alert-1', 1)]);
    (context.contextManager.callKibanaApi as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({
        status: 200,
        body: { offset: 0, size: 200, tasks: [run('t1', 'alert-1', 1)] },
      })
      .mockRejectedValueOnce(new Error('outcomes unavailable'));

    await expect(detonateCompletedRunsStepDefinition.handler(context)).rejects.toThrow(
      'outcomes unavailable'
    );
  });
});
