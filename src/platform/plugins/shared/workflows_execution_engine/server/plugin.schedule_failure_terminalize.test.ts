/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * "Elastic License 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; dual-licensed under the "Elastic License 2.0", the "GNU Affero
 * General Public License v3.0 only", and the "Server Side Public License v 1.0".
 */

import type { KibanaRequest } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import {
  ConcurrencySlotOccupyingExecutionStatuses,
  type EsWorkflowExecution,
  ExecutionStatus,
  type WorkflowExecutionEngineModel,
} from '@kbn/workflows';

jest.mock('./repositories/data_access_layer', () => {
  const actual = jest.requireActual('./repositories/data_access_layer');
  const { createDataClientJestMock } = jest.requireActual('./test_utils/data_client_jest_mock');
  return {
    ...actual,
    createDataClientBundle: jest.fn(() => createDataClientJestMock()),
  };
});
jest.mock('./lib/check_license', () => ({
  checkLicense: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./lib/get_user', () => ({
  getAuthenticatedUser: jest.fn().mockResolvedValue('test-user'),
}));

// In-memory execution store shared by the repository mocks below. This lets the
// concurrency gate observe the statuses the code under test actually writes.
const executions = new Map<string, Partial<EsWorkflowExecution>>();
const mockCreateWorkflowExecution = jest.fn();
const mockBulkCreateWorkflowExecutions = jest.fn();
const mockGetWorkflowExecutionById = jest.fn();
const mockUpdateWorkflowExecution = jest.fn();
const mockDiscardUnstartedExecution = jest.fn();
jest.mock('./repositories/workflow_execution_repository', () => ({
  WorkflowExecutionRepository: jest.fn().mockImplementation(() => ({
    createWorkflowExecution: mockCreateWorkflowExecution,
    bulkCreateWorkflowExecutions: mockBulkCreateWorkflowExecutions,
    getWorkflowExecutionById: mockGetWorkflowExecutionById,
    updateWorkflowExecution: mockUpdateWorkflowExecution,
    discardUnstartedExecution: mockDiscardUnstartedExecution,
  })),
}));

const mockMarkNonTerminalStepsFailed = jest.fn().mockResolvedValue(undefined);
jest.mock('./repositories/step_execution_repository', () => ({
  StepExecutionRepository: jest.fn().mockImplementation(() => ({
    markNonTerminalStepsFailed: mockMarkNonTerminalStepsFailed,
  })),
}));

const mockGetWorkflowExecutionStates = jest.fn();
const mockIsWorkflowEnabledRealtime = jest.fn();
const mockGetWorkflow = jest.fn();
const mockIsWorkflowEnabled = jest.fn();
const mockAreWorkflowsEnabled = jest.fn();
jest.mock('@kbn/workflows', () => {
  const actual = jest.requireActual('@kbn/workflows');
  return {
    ...actual,
    WorkflowRepository: jest.fn().mockImplementation(() => ({
      getWorkflowExecutionStates: mockGetWorkflowExecutionStates,
      isWorkflowEnabled: mockIsWorkflowEnabled,
      isWorkflowEnabledRealtime: mockIsWorkflowEnabledRealtime,
      getWorkflow: mockGetWorkflow,
      areWorkflowsEnabled: mockAreWorkflowsEnabled,
    })),
  };
});

const mockConcurrencyCheckConcurrency = jest.fn();
const mockEvaluateConcurrencyKey = jest.fn();
jest.mock('./concurrency/concurrency_manager', () => ({
  ConcurrencyManager: jest.fn().mockImplementation(() => ({
    checkConcurrency: mockConcurrencyCheckConcurrency,
    evaluateConcurrencyKey: mockEvaluateConcurrencyKey,
  })),
}));

import { buildTaskSchedulingFailedMessage } from './lib/task_recovery';
import { WorkflowsExecutionEnginePlugin } from './plugin';

const SCHEDULE_ERROR = new Error('0xD38358: failed to grant API key');

const createWorkflow = (
  id: string,
  overrides: Partial<WorkflowExecutionEngineModel> = {}
): WorkflowExecutionEngineModel =>
  ({
    id,
    name: `Workflow ${id}`,
    enabled: true,
    version: '1',
    triggers: [{ type: 'manual' }],
    steps: [],
    ...overrides,
  } as WorkflowExecutionEngineModel);

describe('schedule failure terminalization', () => {
  let coreStart: ReturnType<typeof coreMock.createStart>;
  let plugin: WorkflowsExecutionEnginePlugin;
  let pluginStart: Awaited<ReturnType<WorkflowsExecutionEnginePlugin['start']>>;
  let taskManager: ReturnType<typeof taskManagerMock.createStart>;
  const request = {} as KibanaRequest;

  beforeEach(async () => {
    jest.clearAllMocks();
    executions.clear();
    // Mirror ConcurrencyManager.checkConcurrency's slot semantics
    // (src/platform/plugins/shared/workflows_execution_engine/server/concurrency/concurrency_manager.ts,
    // ConcurrencySlotOccupyingExecutionStatuses from @kbn/workflows) against the
    // in-memory store so tests observe the statuses the code under test writes.
    mockConcurrencyCheckConcurrency.mockImplementation(
      async (settings: { max?: number } | undefined, key: string | null, currentId: string) => {
        if (!settings || !key) {
          return true;
        }
        const others = Array.from(executions.values()).filter(
          (e) =>
            e.concurrencyGroupKey === key &&
            e.id !== currentId &&
            ConcurrencySlotOccupyingExecutionStatuses.includes(e.status as ExecutionStatus)
        );
        return others.length < (settings.max ?? 1);
      }
    );
    mockEvaluateConcurrencyKey.mockReturnValue(null);
    mockGetWorkflowExecutionStates.mockResolvedValue(new Map());
    mockIsWorkflowEnabled.mockResolvedValue(true);
    mockIsWorkflowEnabledRealtime.mockResolvedValue(true);
    mockAreWorkflowsEnabled.mockImplementation(
      async (refs: Array<{ workflowId: string; spaceId: string }>) => {
        const map = new Map<string, boolean>();
        for (const ref of refs) {
          map.set(`${ref.spaceId}:${ref.workflowId}`, true);
        }
        return map;
      }
    );
    mockDiscardUnstartedExecution.mockResolvedValue(undefined);

    mockCreateWorkflowExecution.mockImplementation(async (execution) => {
      executions.set(execution.id as string, { ...execution });
    });
    mockBulkCreateWorkflowExecutions.mockImplementation(async (created) => {
      for (const execution of created) {
        executions.set(execution.id as string, { ...execution });
      }
      return created.map((execution: { id: string }) => ({ id: execution.id, index: '.mock' }));
    });
    mockGetWorkflowExecutionById.mockImplementation(
      async (id: string) => executions.get(id) ?? null
    );
    mockUpdateWorkflowExecution.mockImplementation(async (patch: { id: string }) => {
      const execution = executions.get(patch.id);
      if (execution) {
        Object.assign(execution, patch);
      }
    });

    const initializerContext = coreMock.createPluginInitializerContext({
      logging: { console: false },
      eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
    });
    plugin = new WorkflowsExecutionEnginePlugin(initializerContext);

    const coreSetup = coreMock.createSetup();
    plugin.setup(coreSetup as any, {
      taskManager: taskManagerMock.createSetup(),
      cloud: {} as any,
      workflowsExtensions: { registerConnectorAdapter: jest.fn() } as any,
    });

    coreStart = coreMock.createStart();
    taskManager = taskManagerMock.createStart();
    pluginStart = plugin.start(coreStart, {
      taskManager,
      actions: {} as any,
      cloud: {} as any,
      workflowsExtensions: {} as any,
      licensing: licensingMock.createStart(),
    });
  });

  const expectTerminalizedFailed = (id: string) => {
    const doc = executions.get(id);
    expect(doc?.status).toBe(ExecutionStatus.FAILED);
    expect(doc?.error).toEqual({
      type: 'TaskRecoveryError',
      message: buildTaskSchedulingFailedMessage(SCHEDULE_ERROR),
    });
    expect(doc?.finishedAt).toEqual(expect.any(String));
    expect(mockMarkNonTerminalStepsFailed).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ message: buildTaskSchedulingFailedMessage(SCHEDULE_ERROR) })
    );
  };

  const lastCreatedExecutionId = () => Array.from(executions.keys()).at(-1) as string;

  it('executeWorkflow terminalizes the execution when schedule rejects', async () => {
    taskManager.schedule.mockRejectedValue(SCHEDULE_ERROR);

    await expect(
      pluginStart.executeWorkflow(createWorkflow('w1'), { spaceId: 'default' }, request)
    ).rejects.toThrow('0xD38358');

    expectTerminalizedFailed(lastCreatedExecutionId());
  });

  it('scheduleWorkflow terminalizes the execution when schedule rejects', async () => {
    taskManager.schedule.mockRejectedValue(SCHEDULE_ERROR);

    await expect(
      pluginStart.scheduleWorkflow(createWorkflow('w2'), { spaceId: 'default' }, request)
    ).rejects.toThrow('0xD38358');

    expectTerminalizedFailed(lastCreatedExecutionId());
  });

  it('executeWorkflowStep terminalizes the execution when schedule rejects', async () => {
    taskManager.schedule.mockRejectedValue(SCHEDULE_ERROR);

    await expect(
      pluginStart.executeWorkflowStep(createWorkflow('w3'), 'step-1', {}, {}, request)
    ).rejects.toThrow('0xD38358');

    expectTerminalizedFailed(lastCreatedExecutionId());
  });

  it('bulkScheduleWorkflow terminalizes every created execution when bulkSchedule rejects', async () => {
    mockGetWorkflowExecutionStates.mockResolvedValue(
      new Map([
        ['default:b1', { enabled: true }],
        ['default:b2', { enabled: true }],
        ['default:b3', { enabled: true }],
      ])
    );
    taskManager.bulkSchedule.mockRejectedValue(SCHEDULE_ERROR);
    const workflows = [createWorkflow('b1'), createWorkflow('b2'), createWorkflow('b3')];

    await expect(
      pluginStart.bulkScheduleWorkflow(
        workflows.map((workflow) => ({ workflow, context: { spaceId: 'default' } })),
        request
      )
    ).rejects.toThrow('0xD38358');

    expect(executions.size).toBe(workflows.length);
    for (const id of executions.keys()) {
      expectTerminalizedFailed(id);
    }
  });

  it('does not terminalize when scheduling succeeds', async () => {
    taskManager.schedule.mockResolvedValue({ id: 'task-1' } as any);

    await pluginStart.executeWorkflow(createWorkflow('ok'), { spaceId: 'default' }, request);

    expect(executions.size).toBe(1);
    const doc = Array.from(executions.values())[0];
    expect(doc?.status).toBe(ExecutionStatus.PENDING);
    expect(doc?.error).toBeUndefined();
    expect(mockUpdateWorkflowExecution).not.toHaveBeenCalled();
  });

  // The user-visible symptom from security-team#20035: a pending doc that never
  // gets a task holds its concurrency slot forever, so every later run on the
  // same key is skipped. After the fix, the failed doc releases the slot and a
  // second run proceeds.
  it('a second run on the same concurrency key is not skipped after a schedule failure', async () => {
    const concurrencySettings = { strategy: 'skip' as const, max: 1 };
    mockEvaluateConcurrencyKey.mockReturnValue('group-1');
    const workflow = createWorkflow('conc', {
      definition: { settings: { concurrency: concurrencySettings } } as never,
    });

    // First run: scheduling fails -> execution terminalized as failed.
    taskManager.schedule.mockRejectedValueOnce(SCHEDULE_ERROR);
    await expect(
      pluginStart.scheduleWorkflow(workflow, { spaceId: 'default' }, request)
    ).rejects.toThrow('0xD38358');
    const failedId = lastCreatedExecutionId();
    expectTerminalizedFailed(failedId);

    // Second run on the same key: the failed doc no longer occupies the slot.
    taskManager.schedule.mockResolvedValue({ id: 'task-2' } as any);
    const second = await pluginStart.scheduleWorkflow(workflow, { spaceId: 'default' }, request);

    const secondDoc = executions.get(second.workflowExecutionId as string);
    expect(secondDoc?.status).not.toBe(ExecutionStatus.SKIPPED);
    expect(secondDoc?.status).toBe(ExecutionStatus.PENDING);
    expect(taskManager.schedule).toHaveBeenCalledTimes(2);
  });
});
