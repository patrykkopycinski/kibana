/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

global.fetch = jest.fn();

import type { JsonObject } from '@kbn/utility-types';
import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowRunFixture } from '@kbn/workflows-execution-engine/integration_tests/workflow_run_fixture';

const DISABLED_SETUP_CONFIG = {
  enabled: false,
  connector: {
    id: 'daybreak-test-connector',
    actionTypeId: '.gen-ai',
  },
  thresholds: {
    minimumConfidence: 0.7,
    maximumAlertsPerRun: 25,
  },
  already_tagged: false,
};

const ALERT_ANALYSIS_WORKER_SETUP_DISABLED_YAML = `
steps:
  - name: setup
    type: kibana.request
    with:
      method: GET
      path: '/internal/daybreak/config'

  - name: guard_enabled
    type: if
    condition: 'steps.setup.output.enabled: true'
    steps:
      - name: guard
        type: if
        condition: 'NOT steps.setup.output.already_tagged: true'
        steps:
          - name: enrich
            type: kibana.request
            with:
              method: GET
              path: '/internal/detection_engine/signals/_alerts_summary'
`;

function createMockReadableStream(data: string) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  let consumed = false;
  return {
    getReader: () => ({
      read: async () => {
        if (consumed) return { done: true, value: undefined };
        consumed = true;
        return { done: false, value: encoded };
      },
      releaseLock: () => {},
      cancel: jest.fn(),
    }),
  };
}

function createMockJsonResponse(body: object) {
  return {
    ok: true,
    status: 200,
    body: createMockReadableStream(JSON.stringify(body)),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

const getStepExecutions = (fixture: WorkflowRunFixture, stepId: string) =>
  Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values()).filter(
    (stepExecution) => stepExecution.stepId === stepId
  );

describe('alert analysis worker workflow', () => {
  let workflowRunFixture: WorkflowRunFixture;

  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue(createMockJsonResponse(DISABLED_SETUP_CONFIG));

    workflowRunFixture = new WorkflowRunFixture();
    (workflowRunFixture.fakeKibanaRequest as { headers?: Record<string, string> }).headers = {
      authorization: 'Api-Key c29tZS1rZXk=',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists the Setup step structured output shape (FR-006, FR-007)', async () => {
    await workflowRunFixture.runWorkflow({
      workflowYaml: ALERT_ANALYSIS_WORKER_SETUP_DISABLED_YAML,
    });

    const executions = getStepExecutions(workflowRunFixture, 'setup');
    const completed = executions.find(
      (stepExecution) => stepExecution.status === ExecutionStatus.COMPLETED
    );

    expect(completed).toBeDefined();
    expect(completed?.output).toEqual(DISABLED_SETUP_CONFIG);
  });

  it('short-circuits downstream phases when setup returns enabled false (FR-006, FR-007)', async () => {
    await workflowRunFixture.runWorkflow({
      workflowYaml: ALERT_ANALYSIS_WORKER_SETUP_DISABLED_YAML,
    });

    const workflowExecution =
      workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
    const guardEnabled = getStepExecutions(workflowRunFixture, 'guard_enabled').find(
      (stepExecution) =>
        (stepExecution.input as JsonObject | undefined)?.conditionResult !== undefined
    );

    expect(workflowExecution?.status).toBe(ExecutionStatus.COMPLETED);
    expect(guardEnabled?.input).toHaveProperty('conditionResult', false);
    expect(getStepExecutions(workflowRunFixture, 'guard')).toHaveLength(0);
    expect(getStepExecutions(workflowRunFixture, 'enrich')).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
