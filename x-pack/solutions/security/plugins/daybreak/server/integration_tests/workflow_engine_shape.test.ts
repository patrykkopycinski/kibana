/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Mock global fetch before the fixture imports the engine internals — the
// kibana.request step type calls fetch() at runtime and there is no live
// Kibana server in the integration-test harness.
global.fetch = jest.fn();

import type { JsonObject } from '@kbn/utility-types';
import { ExecutionStatus } from '@kbn/workflows';
import { FakeConnectors } from '@kbn/workflows-execution-engine/integration_tests/mocks/actions_plugin_mock';
import { WorkflowRunFixture } from '@kbn/workflows-execution-engine/integration_tests/workflow_run_fixture';

/**
 * PD-1 spike workflow definition — inline YAML mirroring
 * server/workflow/spike_workflow.yaml but using the FakeConnectors identifiers
 * so the echo_inference stub produces a deterministic, assertion-ready result
 * (FR-015).
 */
const SPIKE_WORKFLOW_YAML = `
steps:
  - name: fetch_alert_summary
    type: kibana.request
    with:
      method: GET
      path: '/internal/detection_engine/signals/_alerts_summary'

  - name: guard_has_alerts
    type: if
    condition: 'steps.fetch_alert_summary.output.total:*'
    steps:
      - name: analyze_alert
        type: ${FakeConnectors.echo_inference.actionTypeId}
        connector-id: ${FakeConnectors.echo_inference.name}
        with:
          text: 'Analyze alert summary for triage insights.'
`;

/** Expected structured payload returned by the mocked HTTP fetch step. */
const MOCK_ALERT_SUMMARY = {
  total: 5,
  alert_ids: ['alert-1', 'alert-2', 'alert-3', 'alert-4', 'alert-5'],
};

/** Text passed to the echo_inference connector via the `with.text` field. */
const INFERENCE_INPUT_TEXT = 'Analyze alert summary for triage insights.';

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
  const json = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    body: createMockReadableStream(json),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

const getStepExecutions = (fixture: WorkflowRunFixture, stepId: string) =>
  Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values()).filter(
    (se) => se.stepId === stepId
  );

describe('workflow engine shape validation (PD-1)', () => {
  let workflowRunFixture: WorkflowRunFixture;

  beforeAll(async () => {
    (global.fetch as jest.Mock).mockResolvedValue(createMockJsonResponse(MOCK_ALERT_SUMMARY));

    workflowRunFixture = new WorkflowRunFixture();

    // The kibana.request step type reads auth headers from the fake request
    // (getAuthHeaders). The fixture default has none, so provide a test value.
    (workflowRunFixture.fakeKibanaRequest as { headers?: Record<string, string> }).headers = {
      authorization: 'Api-Key c29tZS1rZXk=',
    };

    await workflowRunFixture.runWorkflow({ workflowYaml: SPIKE_WORKFLOW_YAML });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // FR-011 — end-to-end execution
  it('completes the full HTTP fetch → guard → inference workflow', () => {
    const doc = workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
      'fake_workflow_execution_id'
    );
    expect(doc?.status).toBe(ExecutionStatus.COMPLETED);
    expect(doc?.error).toBeUndefined();
  });

  // FR-012 — HTTP-fetch step structured output
  it('kibana.request step produces the expected structured output shape', () => {
    const executions = getStepExecutions(workflowRunFixture, 'fetch_alert_summary');
    expect(executions.length).toBeGreaterThanOrEqual(1);

    const completed = executions.find((se) => se.status === ExecutionStatus.COMPLETED);
    expect(completed).toBeDefined();
    expect(completed?.output).toEqual(MOCK_ALERT_SUMMARY);
  });

  // FR-013 — conditional-guard step output
  it('if step evaluates the condition and enters the true branch', () => {
    const executions = getStepExecutions(workflowRunFixture, 'guard_has_alerts');
    expect(executions.length).toBeGreaterThanOrEqual(1);

    // The EnterIfNode records the raw condition, the rendered condition, and
    // its boolean result in the step execution input.
    const conditionEval = executions.find(
      (se) => (se.input as JsonObject | undefined)?.conditionResult !== undefined
    );
    expect(conditionEval).toBeDefined();
    expect(conditionEval?.input).toHaveProperty('conditionResult', true);
    expect(conditionEval?.input).toHaveProperty(
      'condition',
      'steps.fetch_alert_summary.output.total:*'
    );

    // The nested then-branch step must have executed (guard passed).
    const inferenceExecutions = getStepExecutions(workflowRunFixture, 'analyze_alert');
    expect(inferenceExecutions.length).toBeGreaterThanOrEqual(1);
    expect(inferenceExecutions[0].status).toBe(ExecutionStatus.COMPLETED);
  });

  // FR-014 — stub AI-invocation step structured JSON output
  it('inference step produces the expected structured JSON output shape', () => {
    const executions = getStepExecutions(workflowRunFixture, 'analyze_alert');
    expect(executions.length).toBeGreaterThanOrEqual(1);

    const completed = executions.find((se) => se.status === ExecutionStatus.COMPLETED);
    expect(completed).toBeDefined();

    // echo_inference returns data: [{ result: params.text }]
    expect(completed?.output).toEqual([{ result: INFERENCE_INPUT_TEXT }]);
  });
});
