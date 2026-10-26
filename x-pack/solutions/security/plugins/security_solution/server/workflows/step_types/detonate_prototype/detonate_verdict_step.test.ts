/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateVerdictStepDefinition } from './detonate_verdict_step';
import { DETONATE_TASKS_PATH } from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';

type HandlerContext = Parameters<typeof detonateVerdictStepDefinition.handler>[0];

const createMockContext = (input: Record<string, unknown>, task: DetonateTask) =>
  ({
    input,
    contextManager: { callKibanaApi: jest.fn().mockResolvedValue({ status: 200, body: task }) },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as HandlerContext);

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: ['alert:alert-9'],
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.0.0',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  exec_wait_secs: 30,
  pre_exec_commands: [],
  exec_commands: [],
  vm_has_internet: false,
  production_endpoint_alert_groups: [{ alerts_count: 2, event_code: 'malicious_file' }],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...overrides,
});

describe('detonateVerdictStepDefinition', () => {
  it('reads the task through the internal route and derives the verdict', async () => {
    const context = createMockContext(
      { task_id: 'task-1' },
      createTask({ production_endpoint_alerts_count: 2 })
    );

    const result = await detonateVerdictStepDefinition.handler(context);

    expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith({
      method: 'GET',
      path: `${DETONATE_TASKS_PATH}/task-1`,
      headers: { 'elastic-api-version': '1' },
    });
    expect(result.output).toMatchObject({
      verdict: 'malicious',
      task_id: 'task-1',
      alert_id: 'alert-9',
      total_alerts_count: 2,
      endpoint_alert_event_codes: ['malicious_file'],
    });
  });

  it("prefers an explicit alert_id over the task's alert tag", async () => {
    const context = createMockContext(
      { task_id: 'task-1', alert_id: 'explicit-1' },
      createTask({ production_endpoint_alerts_count: 2 })
    );

    const result = await detonateVerdictStepDefinition.handler(context);
    expect(result.output).toMatchObject({ alert_id: 'explicit-1' });
  });

  it('propagates read failures as execution errors', async () => {
    const context = createMockContext({ task_id: 'missing' }, createTask());
    (context.contextManager.callKibanaApi as jest.Mock).mockRejectedValue(
      new Error('route blew up')
    );

    await expect(detonateVerdictStepDefinition.handler(context)).rejects.toThrow();
  });
});
