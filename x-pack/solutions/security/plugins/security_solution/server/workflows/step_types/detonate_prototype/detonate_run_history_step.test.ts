/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateRunHistoryStepDefinition } from './detonate_run_history_step';
import { DETONATE_TASKS_PATH } from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';

type HandlerContext = Parameters<typeof detonateRunHistoryStepDefinition.handler>[0];

const HASH = 'a'.repeat(64);

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: [],
  sample_hash: HASH,
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

const quiet = (id: string, day: number) =>
  createTask({ id, created_at: `2026-01-0${day}T00:00:00.000Z` });

const malicious = (id: string, day: number) =>
  createTask({
    id,
    created_at: `2026-01-0${day}T00:00:00.000Z`,
    production_endpoint_alerts_count: 1,
    production_endpoint_alert_groups: [{ event_code: 'malicious_file', alerts_count: 1 }],
  });

const createMockContext = (tasks: DetonateTask[]) =>
  ({
    input: { sha256: HASH },
    contextManager: {
      callKibanaApi: jest.fn().mockResolvedValue({
        status: 200,
        body: { total: tasks.length, offset: 0, size: 200, tasks },
      }),
    },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as HandlerContext);

describe('detonateRunHistoryStepDefinition', () => {
  it('reads the tasks route filtered by hash, at the route page cap', async () => {
    const context = createMockContext([]);

    await detonateRunHistoryStepDefinition.handler(context);

    expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith({
      method: 'GET',
      path: `${DETONATE_TASKS_PATH}?query_string=${HASH}&size=200`,
      headers: { 'elastic-api-version': '1' },
    });
  });

  it('is proposal-eligible once three runs in a row completed quiet', async () => {
    // Deliberately out of order: the step sorts newest-first itself.
    const context = createMockContext([quiet('t2', 2), quiet('t3', 3), quiet('t1', 1)]);

    const { output } = await detonateRunHistoryStepDefinition.handler(context);

    expect(output).toMatchObject({
      completed_runs: 3,
      quiet_streak: 3,
      proposal_eligible: true,
    });
    expect(output?.runs.map((run) => run.task_id)).toEqual(['t3', 't2', 't1']);
    expect(output?.evidence_comment).toContain('3 consecutive detonation(s)');
  });

  it('breaks the streak at the newest non-quiet run', async () => {
    const context = createMockContext([quiet('t1', 1), quiet('t2', 2), malicious('t3', 3)]);

    const { output } = await detonateRunHistoryStepDefinition.handler(context);

    expect(output?.quiet_streak).toBe(0);
    expect(output?.proposal_eligible).toBe(false);
    expect(output?.runs[0]).toMatchObject({ task_id: 't3', verdict: 'malicious' });
  });

  it('ignores failed, unfinished and other-sample runs', async () => {
    const context = createMockContext([
      quiet('t1', 1),
      quiet('t2', 2),
      createTask({
        id: 'failed',
        created_at: '2026-01-03T00:00:00.000Z',
        last_worker_status: 'failure',
      }),
      createTask({
        id: 'running',
        created_at: '2026-01-04T00:00:00.000Z',
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'success',
      }),
      createTask({
        id: 'other',
        created_at: '2026-01-05T00:00:00.000Z',
        sample_hash: 'b'.repeat(64),
      }),
    ]);

    const { output } = await detonateRunHistoryStepDefinition.handler(context);

    expect(output?.runs.map((run) => run.task_id)).toEqual(['t2', 't1']);
    expect(output?.quiet_streak).toBe(2);
    expect(output?.proposal_eligible).toBe(false);
  });

  it('propagates route failures as execution errors', async () => {
    const context = createMockContext([]);
    (context.contextManager.callKibanaApi as jest.Mock).mockRejectedValue(
      new Error('route blew up')
    );

    await expect(detonateRunHistoryStepDefinition.handler(context)).rejects.toThrow();
  });
});
