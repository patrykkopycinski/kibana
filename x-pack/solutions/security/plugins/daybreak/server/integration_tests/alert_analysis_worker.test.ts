/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

global.fetch = jest.fn();

import type { JsonObject } from '@kbn/utility-types';
import { ExecutionStatus, isDeprecatedStepType, StepCategory } from '@kbn/workflows';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { WorkflowRunFixture } from '@kbn/workflows-execution-engine/integration_tests/workflow_run_fixture';
import { z } from '@kbn/zod/v4';
import { ALERT_ANALYSIS_AGENT_ID } from '../agent_builder/ensure_alert_analysis_agent';
import { requireReadinessGate, ReadinessGateError } from '../client/proposals/gate';
import type { ProposalProperties } from '../client/proposals/types';
import ALERT_ANALYSIS_WORKER_YAML from '../workflow/alert_analysis_worker.yaml';

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

const ALREADY_TAGGED_SETUP_CONFIG = {
  ...DISABLED_SETUP_CONFIG,
  enabled: true,
  already_tagged: true,
};

const ENABLED_NOT_TAGGED_CONFIG = {
  ...DISABLED_SETUP_CONFIG,
  enabled: true,
  already_tagged: false,
};

const MOCK_ALERT_SUMMARY = {
  total: 1,
  alert_ids: ['alert-1'],
};

const MOCK_CREATED_PROPOSAL: ProposalProperties = {
  id: 'proposal-from-worker-1',
  title: 'Alert triage proposal',
  capability: 'detection',
  severity: 'high',
  confidence: 0.85,
  status: 'new',
  evidenceRefs: [],
  decisionHistory: [],
  createdAt: '2025-01-01T00:00:00.000Z',
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

/**
 * The workflow step type id for Agent Builder's run-agent step —
 * `RunAgentStepTypeId = 'ai.agent'`, defined at
 * `x-pack/platform/plugins/shared/agent_builder/common/step_types/run_agent_step.ts`
 * and registered via `workflowsExtensions.registerStepDefinition`. Asserted
 * literally here so the test fails if the worker drifts to a deprecated
 * connector-family type (`inference.*`, `bedrock.*`, etc.) (FR-010, FR-011).
 */
const REASON_STEP_TYPE = 'ai.agent';

/**
 * Deterministic stub for the `ai.agent` step. The real handler
 * (`getRunAgentStepDefinition`) requires a live Agent Builder execution service
 * the WorkflowRunFixture cannot provide, so this stub mirrors only the step's
 * config shape (`agent-id`) and echoes it into the output. That lets the
 * integration test prove the engine dispatches the Reason phase as a recognized
 * `ai.agent` custom step (FR-010) carrying the correct agent id (FR-012, FR-013).
 */
const stubRunAgentStep = createServerStepDefinition({
  id: REASON_STEP_TYPE,
  category: StepCategory.Ai,
  label: 'ai.agent (test stub)',
  description: 'Deterministic stub for the alert-analysis worker Reason phase.',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ message: z.string(), agent_id: z.string().optional() }),
  configSchema: z.object({ 'agent-id': z.string().optional() }),
  handler: async (context) => ({
    output: {
      message: context.input.message,
      agent_id: context.config['agent-id'],
    },
  }),
});

const wireReasonStepStub = (fixture: WorkflowRunFixture) => {
  (fixture.dependencies.workflowsExtensions.getStepDefinition as jest.Mock).mockImplementation(
    (id: string) => (id === REASON_STEP_TYPE ? stubRunAgentStep : undefined)
  );
  (fixture.dependencies.workflowsExtensions.hasStepDefinition as jest.Mock).mockImplementation(
    (id: string) => id === REASON_STEP_TYPE
  );
};

const STRUCTURED_TRIAGE_VERDICT = {
  verdict: 'true_positive',
  confidence: 0.85,
  rationale: 'Alert pattern matches known attack signature with high signal-to-noise ratio.',
};

const stubRunAgentStepWithStructuredOutput = createServerStepDefinition({
  id: REASON_STEP_TYPE,
  category: StepCategory.Ai,
  label: 'ai.agent (test stub — structured output)',
  description:
    'Extended stub that includes structured_output so the validate_reasoning gate passes and the Act phase executes.',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({
    message: z.string(),
    agent_id: z.string().optional(),
    structured_output: z
      .object({
        verdict: z.string(),
        confidence: z.number(),
        rationale: z.string(),
      })
      .optional(),
  }),
  configSchema: z.object({ 'agent-id': z.string().optional() }),
  handler: async (context) => ({
    output: {
      message: context.input.message,
      agent_id: context.config['agent-id'],
      structured_output: STRUCTURED_TRIAGE_VERDICT,
    },
  }),
});

const wireActPhaseStub = (fixture: WorkflowRunFixture) => {
  (fixture.dependencies.workflowsExtensions.getStepDefinition as jest.Mock).mockImplementation(
    (id: string) => (id === REASON_STEP_TYPE ? stubRunAgentStepWithStructuredOutput : undefined)
  );
  (fixture.dependencies.workflowsExtensions.hasStepDefinition as jest.Mock).mockImplementation(
    (id: string) => id === REASON_STEP_TYPE
  );
};

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

  it('halts at the Guard step when the alert already carries the result tag (FR-006, FR-008)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      createMockJsonResponse(ALREADY_TAGGED_SETUP_CONFIG)
    );

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
    const guard = getStepExecutions(workflowRunFixture, 'guard').find(
      (stepExecution) =>
        (stepExecution.input as JsonObject | undefined)?.conditionResult !== undefined
    );

    expect(workflowExecution?.status).toBe(ExecutionStatus.COMPLETED);
    expect(guardEnabled?.input).toHaveProperty('conditionResult', true);
    expect(guard?.input).toHaveProperty('conditionResult', false);
    expect(getStepExecutions(workflowRunFixture, 'enrich')).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('Reason phase — ai.agent step (FR-010, FR-011, FR-012, FR-013)', () => {
  let workflowRunFixture: WorkflowRunFixture;

  beforeAll(async () => {
    // The production worker YAML has two kibana.request steps that reach the
    // Reason phase: Setup (config) and Enrich (alerts summary). Branch the
    // fetch mock by path so each gets its own deterministic payload.
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('/internal/daybreak/config')) {
        return createMockJsonResponse(ENABLED_NOT_TAGGED_CONFIG);
      }
      return createMockJsonResponse(MOCK_ALERT_SUMMARY);
    });

    workflowRunFixture = new WorkflowRunFixture();
    wireReasonStepStub(workflowRunFixture);
    (workflowRunFixture.fakeKibanaRequest as { headers?: Record<string, string> }).headers = {
      authorization: 'Api-Key c29tZS1rZXk=',
    };

    // Run the real production 5-phase worker (Setup → Guard → Enrich → Reason),
    // not an inline copy, so the assertions pin the shipped definition directly.
    await workflowRunFixture.runWorkflow({ workflowYaml: ALERT_ANALYSIS_WORKER_YAML });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const getReasonStep = () =>
    getStepExecutions(workflowRunFixture, 'reason').find(
      // The production Reason step carries `timeout: 600s`, which the engine
      // wraps in enter/exit timeout-zone nodes (stepType 'step_level_timeout')
      // sharing the same stepId. Filter for the actual ai.agent step record.
      (stepExecution) => stepExecution.stepType === REASON_STEP_TYPE
    );

  // FR-010 — Reason phase is an ai.agent workflow step; FR-011 — it must not be
  // a deprecated connector-family type (inference.*/bedrock.*/gen-ai.*/gemini.*).
  it('dispatches the Reason step as type ai.agent through the workflow engine (FR-010, FR-011)', () => {
    const reason = getReasonStep();

    expect(reason).toBeDefined();
    expect(reason?.status).toBe(ExecutionStatus.COMPLETED);
    expect(reason?.stepType).toBe(REASON_STEP_TYPE);
    expect(isDeprecatedStepType(reason?.stepType ?? '')).toBe(false);
  });

  // FR-012 — the agent-id matches the Task 0.1 alert-analysis agent created by
  // ensureAlertAnalysisAgent; FR-013 — the alert-analysis skill is referenced
  // indirectly via that agent, never forked.
  it('resolves the Reason step agent-id to the Task 0.1 alert-analysis agent (FR-012, FR-013)', () => {
    const reason = getReasonStep();

    expect(reason).toBeDefined();
    expect(reason?.status).toBe(ExecutionStatus.COMPLETED);
    expect((reason?.output as { agent_id?: string } | undefined)?.agent_id).toBe(
      ALERT_ANALYSIS_AGENT_ID
    );
  });
});

describe('Act phase — readiness gate blocks pending proposal (FR-014)', () => {
  let workflowRunFixture: WorkflowRunFixture;

  beforeAll(async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('/internal/daybreak/config')) {
        return createMockJsonResponse(ENABLED_NOT_TAGGED_CONFIG);
      }
      if (String(url).includes('/internal/detection_engine/signals/_alerts_summary')) {
        return createMockJsonResponse(MOCK_ALERT_SUMMARY);
      }
      // POST /internal/daybreak/proposals — Act phase Proposal emission
      return createMockJsonResponse(MOCK_CREATED_PROPOSAL);
    });

    workflowRunFixture = new WorkflowRunFixture();
    wireActPhaseStub(workflowRunFixture);
    (workflowRunFixture.fakeKibanaRequest as { headers?: Record<string, string> }).headers = {
      authorization: 'Api-Key c29tZS1rZXk=',
    };

    await workflowRunFixture.runWorkflow({ workflowYaml: ALERT_ANALYSIS_WORKER_YAML });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const getActStep = () => {
    const executions = getStepExecutions(workflowRunFixture, 'act');
    return executions.find((stepExecution) => stepExecution.status === ExecutionStatus.COMPLETED);
  };

  // FR-014 — the Act phase emits a Proposal/Result record with an auditable
  // shape (actor, timestamp, rationale) via a POST to the proposals endpoint.
  it('emits a Proposal via the Act step POST (FR-014)', () => {
    const act = getActStep();

    expect(act).toBeDefined();
    const proposal = act?.output as ProposalProperties | undefined;
    expect(proposal).toEqual(MOCK_CREATED_PROPOSAL);
    expect(proposal?.createdAt).toBeDefined();
    expect(proposal?.decisionHistory).toEqual([]);
  });

  // FR-014 — a pending Proposal (status 'new', no evidence, no recommendation)
  // blocks the consequential action (transition to 'approved') via
  // requireReadinessGate — fail closed without approval.
  it('blocks approval of a pending proposal via requireReadinessGate — fail closed (FR-014)', () => {
    const act = getActStep();
    expect(act).toBeDefined();

    const pendingProposal = act?.output as unknown as ProposalProperties;

    expect(() => requireReadinessGate(pendingProposal, 'approved')).toThrow(ReadinessGateError);
  });

  // FR-014 counter-factual — once the proposal accumulates evidence and a
  // recommendation, the gate allows the consequential action.
  it('allows approval when the proposal satisfies the readiness gate (FR-014)', () => {
    const act = getActStep();
    expect(act).toBeDefined();

    const satisfiedProposal: ProposalProperties = {
      ...(act?.output as unknown as ProposalProperties),
      evidenceRefs: ['evidence-1'],
      recommendation: 'Escalate to the IR team immediately.',
    };

    expect(() => requireReadinessGate(satisfiedProposal, 'approved')).not.toThrow();
  });
});
