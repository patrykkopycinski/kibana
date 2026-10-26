/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateSampleStepDefinition } from './detonate_sample_step';
import {
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
} from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';

type StartContext = Parameters<NonNullable<typeof detonateSampleStepDefinition.start>>[0];
type PollContext = Parameters<NonNullable<typeof detonateSampleStepDefinition.poll>>[0];

const createMockContext = (input: Record<string, unknown>) =>
  ({
    input,
    config: {},
    rawInput: input,
    contextManager: {
      getContext: jest.fn(),
      getScopedEsClient: jest.fn(),
      renderInputTemplate: jest.fn(),
      getFakeRequest: jest.fn(),
      callKibanaApi: jest.fn(),
    },
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    abortSignal: new AbortController().signal,
    stepId: 'test-step',
    stepType: 'detonate.prototype.detonateSample',
  } as unknown as StartContext);

const createTaskFixture = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: [],
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

describe('detonateSampleStepDefinition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('submits via POST to submit-hash with the elastic-api-version header', async () => {
      const mockContext = createMockContext({ sample_hash: 'a'.repeat(64) });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: createTaskFixture({ id: 'task-42' }),
      });

      await detonateSampleStepDefinition.start!(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETONATE_SUBMIT_HASH_PATH,
        headers: { 'elastic-api-version': '1' },
        body: { sample_hash: 'a'.repeat(64) },
      });
    });

    it('seeds state with taskId and a deadline 900s out when max_wait_secs is omitted', async () => {
      const mockContext = createMockContext({ sample_hash: 'a'.repeat(64) });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: createTaskFixture({ id: 'task-42' }),
      });

      const before = Date.now();
      const result = (await detonateSampleStepDefinition.start!(mockContext)) as {
        state: { taskId: string; deadlineAt: string };
      };

      expect(result.state.taskId).toBe('task-42');
      const deadlineMs = Date.parse(result.state.deadlineAt);
      // The default budget is 900s; allow only the milliseconds the call took.
      expect(deadlineMs).toBeGreaterThanOrEqual(before + 900_000 - 2_000);
      expect(deadlineMs).toBeLessThanOrEqual(Date.now() + 900_000);
    });

    it('seeds a deadline from the author-provided max_wait_secs', async () => {
      const mockContext = createMockContext({ sample_hash: 'a'.repeat(64), max_wait_secs: 60 });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: createTaskFixture({ id: 'task-42' }),
      });

      const before = Date.now();
      const result = (await detonateSampleStepDefinition.start!(mockContext)) as {
        state: { deadlineAt: string };
      };

      expect(Date.parse(result.state.deadlineAt)).toBeGreaterThanOrEqual(before + 60_000 - 2_000);
    });
  });

  describe('poll', () => {
    const pollContext = (state: unknown, attempt = 0) =>
      ({
        ...createMockContext({ sample_hash: 'a'.repeat(64) }),
        state,
        attempt,
      } as unknown as PollContext);

    it('throws when state is missing (poll ran before start)', async () => {
      const context = pollContext(undefined);

      await expect(detonateSampleStepDefinition.poll(context)).rejects.toThrow(
        /Poll ran before start/
      );
      expect(context.contextManager.callKibanaApi).not.toHaveBeenCalled();
    });

    it('returns a completed output derived from the task, with event codes and rule names de-duplicated', async () => {
      const task = createTaskFixture({
        id: 'task-1',
        production_endpoint_alerts_count: 3,
        diagnostic_endpoint_alerts_count: 1,
        production_detection_alerts_count: 2,
        production_endpoint_alert_groups: [
          { alerts_count: 2, event_code: 'malicious_file' },
          { alerts_count: 1, event_code: 'malicious_file' },
        ],
        diagnostic_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'process_injection' }],
        production_detection_alert_groups: [
          {
            alerts_count: 1,
            kibana_alert_rule_name: 'Malware detection',
            kibana_alert_rule_parameters_severity: 'high',
          },
          {
            alerts_count: 1,
            kibana_alert_rule_name: 'Malware detection',
            kibana_alert_rule_parameters_severity: 'high',
          },
        ],
      });
      const context = pollContext({
        taskId: 'task-1',
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      });
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = (await detonateSampleStepDefinition.poll(context)) as {
        output: Record<string, unknown>;
      };

      expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}/task-1`,
        headers: { 'elastic-api-version': '1' },
      });
      expect(result.output).toEqual({
        task_id: 'task-1',
        completed: true,
        failed: false,
        last_worker_name: 'detonate.workers.make_summary',
        last_worker_status: 'success',
        sample_source: undefined,
        production_endpoint_alerts_count: 3,
        diagnostic_endpoint_alerts_count: 1,
        production_detection_alerts_count: 2,
        total_alerts_count: 6,
        endpoint_alert_event_codes: ['malicious_file', 'process_injection'],
        detection_rule_names: ['Malware detection'],
      });
    });

    it('returns failed: true for a failed run instead of throwing', async () => {
      const task = createTaskFixture({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'failure',
        last_worker_status_details: 'vm boot failed',
        production_endpoint_alerts_count: 1,
        production_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'startup' }],
      });
      const context = pollContext({
        taskId: 'task-1',
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      });
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = (await detonateSampleStepDefinition.poll(context)) as {
        output: Record<string, unknown>;
      };

      expect(result.output).toMatchObject({
        task_id: 'task-1',
        completed: true,
        failed: true,
        last_worker_status_details: 'vm boot failed',
        endpoint_alert_event_codes: ['startup'],
      });
    });

    it('returns completed: false when the deadline has passed, without throwing', async () => {
      const task = createTaskFixture({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'started',
      });
      const context = pollContext({
        taskId: 'task-1',
        submittedAt: new Date(Date.now() - 120_000).toISOString(),
        deadlineAt: new Date(Date.now() - 60_000).toISOString(),
      });
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = (await detonateSampleStepDefinition.poll(context)) as {
        output: Record<string, unknown>;
      };

      expect(result.output).toMatchObject({ task_id: 'task-1', completed: false, failed: false });
    });

    it('continues polling while the run is in flight and the deadline has not passed', async () => {
      const task = createTaskFixture({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'started',
      });
      const state = {
        taskId: 'task-1',
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      };
      const context = pollContext(state, 2);
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = await detonateSampleStepDefinition.poll(context);

      expect(result).toEqual({ state });
    });
  });
});
