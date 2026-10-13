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
 * "Elastic License 2.0", the "GNU Affero General Public License v3.0 only", or the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0" or the "Server Side Public License v 1".
 */

import { coreMock } from '@kbn/core/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { ExecutionStatus } from '@kbn/workflows';
import type { EsWorkflowExecution, WorkflowExecutionEngineModel } from '@kbn/workflows';

// Setup-only mocks: the plugin's data-access bundle and license/user checks are
// not under test. ConcurrencyManager, WorkflowRepository and both execution
// repositories run their real implementations against the fixture's in-memory
// store below.
jest.mock('../../server/repositories/data_access_layer', () => {
  const actual = jest.requireActual('../../server/repositories/data_access_layer');
  const { createDataClientJestMock } = jest.requireActual(
    '../../server/test_utils/data_client_jest_mock'
  );
  return {
    ...actual,
    createDataClientBundle: jest.fn(() => createDataClientJestMock()),
  };
});
jest.mock('../../server/repositories/workflow_execution_repository');
jest.mock('../../server/repositories/step_execution_repository');
jest.mock('../../server/lib/check_license', () => ({
  checkLicense: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../server/lib/get_user', () => ({
  getAuthenticatedUser: jest.fn().mockResolvedValue('test-user'),
}));

import { buildTaskSchedulingFailedMessage } from '../../server/lib/task_recovery';
import { WorkflowsExecutionEnginePlugin } from '../../server/plugin';
import { WorkflowRunFixture } from '../workflow_run_fixture';

const SCHEDULE_ERROR = new Error(
  '0xD38358: Authentication failed while granting an API key for the task'
);

const CHILD_WORKFLOW_ID = 'child-workflow';
const CONCURRENCY_KEY = 'child-concurrency-key';

const CHILD_WORKFLOW_SOURCE = {
  spaceId: 'fake_space_id',
  name: 'Child workflow',
  enabled: true,
  valid: true,
  tags: [],
  created_at: new Date().toISOString(),
  createdBy: 'system',
  updated_at: new Date().toISOString(),
  lastUpdatedBy: 'system',
  yaml: 'steps: []',
  definition: {
    settings: {
      concurrency: { key: CONCURRENCY_KEY, max: 1, strategy: 'drop' as const },
    },
  },
};

const childWorkflowModel = {
  id: CHILD_WORKFLOW_ID,
  name: 'Child workflow',
  enabled: true,
  version: '1',
  triggers: [{ type: 'manual' }],
  steps: [],
  definition: CHILD_WORKFLOW_SOURCE.definition,
} as unknown as WorkflowExecutionEngineModel;

describe('parent workflow whose workflow.execute child cannot be scheduled', () => {
  let workflowRunFixture: WorkflowRunFixture;
  let pluginStart: Awaited<ReturnType<WorkflowsExecutionEnginePlugin['start']>>;

  beforeAll(() => {
    workflowRunFixture = new WorkflowRunFixture();

    // Serve the child workflow definition from the real WorkflowRepository by
    // backing its ES search with an in-memory hit.
    const searchMock = jest.fn().mockResolvedValue({
      took: 0,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        hits: [{ _index: 'workflows', _id: CHILD_WORKFLOW_ID, _source: CHILD_WORKFLOW_SOURCE }],
      },
    });
    workflowRunFixture.dependencies.coreStart.elasticsearch.client.asInternalUser.search =
      searchMock as any;
    const esGetMock = jest.fn().mockResolvedValue({
      _id: CHILD_WORKFLOW_ID,
      _index: 'workflows',
      _source: { enabled: true, spaceId: 'fake_space_id', deleted_at: null },
      found: true,
    });
    const esBulkMock = jest.fn().mockResolvedValue({ took: 0, errors: false, items: [] });

    // Real plugin instance: ConcurrencyManager and both execution repositories
    // are the production implementations wired to the fixture's in-memory
    // store (the fixture jest-mocks the repository classes, so `new` inside
    // plugin.start() returns the fixture instances).
    const initializerContext = coreMock.createPluginInitializerContext({
      logging: { console: false },
      eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
    });
    const plugin = new WorkflowsExecutionEnginePlugin(initializerContext);
    plugin.setup(coreMock.createSetup() as any, {
      taskManager: taskManagerMock.createSetup(),
      cloud: {} as any,
      workflowsExtensions: { registerConnectorAdapter: jest.fn() } as any,
    });
    const pluginCoreStart = coreMock.createStart();
    pluginCoreStart.elasticsearch.client.asInternalUser.search = searchMock as any;
    for (const client of [
      workflowRunFixture.dependencies.coreStart.elasticsearch.client.asInternalUser,
      pluginCoreStart.elasticsearch.client.asInternalUser,
    ] as any[]) {
      client.get = esGetMock;
      client.bulk = esBulkMock;
    }
    pluginStart = plugin.start(pluginCoreStart as any, {
      taskManager: workflowRunFixture.taskManagerMock as any,
      actions: {} as any,
      cloud: {} as any,
      workflowsExtensions: {} as any,
      licensing: licensingMock.createStart(),
    });

    // The parent's workflow.execute step calls this engine start contract.
    (workflowRunFixture as any).workflowsExecutionEngineMock = pluginStart;
  });

  const childExecutions = () =>
    Array.from(
      workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.values()
    ).filter((execution) => execution.id !== 'fake_workflow_execution_id');

  it('fails the child execution and does not block the concurrency group', async () => {
    // Inject the scheduling failure at the Task Manager boundary: the very
    // first schedule call is the child execution created by the parent's
    // workflow.execute step.
    workflowRunFixture.taskManagerMock.schedule.mockRejectedValueOnce(SCHEDULE_ERROR);

    const parentYaml = `
steps:
  - name: runChild
    type: workflow.execute
    with:
      workflow-id: ${CHILD_WORKFLOW_ID}
`;
    await workflowRunFixture.runWorkflow({ workflowYaml: parentYaml });

    // 1. The child execution doc is terminalized as failed with the original
    //    scheduling error, not left pending.
    const children = childExecutions();
    expect(children).toHaveLength(1);
    const child = children[0] as EsWorkflowExecution;
    expect(child.status).toBe(ExecutionStatus.FAILED);
    expect(child.finishedAt).toBeDefined();
    expect(child.error).toEqual(
      expect.objectContaining({ message: buildTaskSchedulingFailedMessage(SCHEDULE_ERROR) })
    );
    expect(child.error?.message).toContain('0xD38358');

    // 2. The failure propagates to the parent (the schedule error is rethrown).
    const parent = workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
      'fake_workflow_execution_id'
    );
    expect(parent?.status).toBe(ExecutionStatus.FAILED);

    // 3. The user-visible symptom: a second run on the same concurrency key is
    //    NOT skipped, because the failed doc no longer occupies the slot. The
    //    real ConcurrencyManager decides this over the real store contents.
    workflowRunFixture.taskManagerMock.schedule.mockResolvedValue({ id: 'task-2' } as any);
    const second = await pluginStart.executeWorkflow(
      childWorkflowModel,
      {
        spaceId: 'fake_space_id',
      },
      workflowRunFixture.fakeKibanaRequest
    );

    const secondDoc = workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
      second.workflowExecutionId as string
    );
    expect(secondDoc?.status).not.toBe(ExecutionStatus.SKIPPED);
    expect(secondDoc?.status).toBe(ExecutionStatus.PENDING);
    expect(workflowRunFixture.taskManagerMock.schedule).toHaveBeenCalledTimes(2);
  });
});
