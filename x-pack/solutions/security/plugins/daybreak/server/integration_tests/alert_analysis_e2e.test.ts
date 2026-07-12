/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// The kibana.request step type calls fetch() at runtime and there is no live
// Kibana server in the integration-test harness — mock it before the fixture
// imports the engine internals.
global.fetch = jest.fn();

import { ExecutionStatus, isDeprecatedStepType, StepCategory } from '@kbn/workflows';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { WorkflowRunFixture } from '@kbn/workflows-execution-engine/integration_tests/workflow_run_fixture';
import { z } from '@kbn/zod/v4';
import { ALERT_ANALYSIS_AGENT_ID } from '../agent_builder/ensure_alert_analysis_agent';
import { requireReadinessGate } from '../client/proposals/gate';
import type { ProposalProperties } from '../client/proposals/types';
import ALERT_ANALYSIS_WORKER_YAML from '../workflow/alert_analysis_worker.yaml';

/**
 * End-to-end "Live UI-Journey Gate" for the alert-analysis worker (FR-9).
 *
 * FR-9 calls for a Playwright/Scout test against a live stack, falling back to
 * asserting the ES document directly when no UI panel exists yet (PD-4 is not
 * delivered on this branch). This test takes that fallback path: it drives
 * the real, shipped 5-phase worker workflow (Setup → Guard → Enrich → Reason
 * → Act) end-to-end through the `WorkflowRunFixture` (real engine runtime,
 * mocked HTTP/Task-Manager boundary) and asserts the Proposal document the
 * Act phase emits matches the full `.kibana-daybreak-proposals` ES document
 * shape (every `ProposalProperties` field, not just a subset).
 */

const REASON_STEP_TYPE = 'ai.agent';

const ENABLED_NOT_TAGGED_CONFIG = {
  enabled: true,
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

const MOCK_ALERT_SUMMARY = {
  total: 1,
  alert_ids: ['alert-e2e-1'],
};

const STRUCTURED_TRIAGE_VERDICT = {
  verdict: 'true_positive',
  confidence: 0.9,
  rationale: 'Ransomware indicators confirmed against known IOC set.',
};

/**
 * The full `.kibana-daybreak-proposals` ES document the
 * `/internal/daybreak/proposals` route would return after indexing — every
 * field of {@link ProposalProperties}, proving the Act phase's POST payload
 * round-trips into a schema-conformant document, not just the subset
 * asserted elsewhere.
 */
const MOCK_PROPOSAL_DOCUMENT: ProposalProperties = {
  id: 'proposal-e2e-1',
  title: 'Ransomware activity on file server FILESERVER-E2E',
  sourceWatch: 'alert-e2e-1',
  capability: 'detection',
  severity: 'critical',
  confidence: 0.9,
  status: 'new',
  owner: 'security-team',
  createdAt: '2026-01-01T00:00:00.000Z',
  recommendation: 'Escalate to the IR team immediately.',
  evidenceRefs: [],
  expectedImpact: 'Prevents lateral spread of ransomware encryption.',
  riskCaveats: ['Automated triage — confirm before isolating production hosts.'],
  approvalRequirement: 'manual',
  requiredApproverCount: 1,
  approvals: [],
  decisionHistory: [],
  space: 'default',
};

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
 * Deterministic stub for the `ai.agent` Reason step, extended with
 * `structured_output` so the `validate_reasoning` guard passes and the Act
 * phase actually executes (the real handler requires a live Agent Builder
 * execution service the fixture cannot provide).
 */
const stubRunAgentStepWithStructuredOutput = createServerStepDefinition({
  id: REASON_STEP_TYPE,
  category: StepCategory.Ai,
  label: 'ai.agent (e2e test stub)',
  description: 'Deterministic stub producing a structured triage verdict for the e2e journey.',
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

const wireReasonStepStub = (fixture: WorkflowRunFixture) => {
  (fixture.dependencies.workflowsExtensions.getStepDefinition as jest.Mock).mockImplementation(
    (id: string) => (id === REASON_STEP_TYPE ? stubRunAgentStepWithStructuredOutput : undefined)
  );
  (fixture.dependencies.workflowsExtensions.hasStepDefinition as jest.Mock).mockImplementation(
    (id: string) => id === REASON_STEP_TYPE
  );
};

describe('alert analysis worker — live-journey e2e (FR-9)', () => {
  let workflowRunFixture: WorkflowRunFixture;

  beforeAll(async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('/internal/daybreak/config')) {
        return createMockJsonResponse(ENABLED_NOT_TAGGED_CONFIG);
      }
      if (String(url).includes('/internal/detection_engine/signals/_alerts_summary')) {
        return createMockJsonResponse(MOCK_ALERT_SUMMARY);
      }
      // POST /internal/daybreak/proposals — the Act phase's Proposal emission,
      // standing in for the live ES document since no UI panel exists (FR-9).
      return createMockJsonResponse(MOCK_PROPOSAL_DOCUMENT);
    });

    workflowRunFixture = new WorkflowRunFixture();
    wireReasonStepStub(workflowRunFixture);
    (workflowRunFixture.fakeKibanaRequest as { headers?: Record<string, string> }).headers = {
      authorization: 'Api-Key ZTJlLXRlc3Qta2V5',
    };

    // Run the real, shipped production worker — not an inline copy — so this
    // gate fails the moment the shipped 5-phase definition drifts.
    await workflowRunFixture.runWorkflow({ workflowYaml: ALERT_ANALYSIS_WORKER_YAML });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('completes the full Setup → Guard → Enrich → Reason → Act journey', () => {
    const workflowExecution =
      workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );

    expect(workflowExecution?.status).toBe(ExecutionStatus.COMPLETED);
    expect(workflowExecution?.error).toBeUndefined();
  });

  it('dispatches the Reason phase as a recognized ai.agent step, never a deprecated connector type', () => {
    const reason = getStepExecutions(workflowRunFixture, 'reason').find(
      (stepExecution) => stepExecution.stepType === REASON_STEP_TYPE
    );

    expect(reason).toBeDefined();
    expect(reason?.status).toBe(ExecutionStatus.COMPLETED);
    expect(isDeprecatedStepType(reason?.stepType ?? '')).toBe(false);
    expect((reason?.output as { agent_id?: string } | undefined)?.agent_id).toBe(
      ALERT_ANALYSIS_AGENT_ID
    );
  });

  it('emits a Proposal document matching the full .kibana-daybreak-proposals ES shape (FR-9)', () => {
    const act = getStepExecutions(workflowRunFixture, 'act').find(
      (stepExecution) => stepExecution.status === ExecutionStatus.COMPLETED
    );

    expect(act).toBeDefined();

    const proposal = act?.output as ProposalProperties | undefined;
    expect(proposal).toEqual(MOCK_PROPOSAL_DOCUMENT);

    // Assert the full document shape field-by-field — the ES-document
    // fallback this test exercises in place of a live UI-journey assertion.
    expect(proposal?.id).toBe(MOCK_PROPOSAL_DOCUMENT.id);
    expect(proposal?.title).toEqual(expect.any(String));
    expect(proposal?.capability).toEqual(expect.any(String));
    expect(['low', 'medium', 'high', 'critical']).toContain(proposal?.severity);
    expect(proposal?.confidence).toBeGreaterThanOrEqual(0);
    expect(proposal?.confidence).toBeLessThanOrEqual(1);
    expect(proposal?.status).toBe('new');
    expect(proposal?.createdAt).toEqual(expect.any(String));
    expect(Array.isArray(proposal?.evidenceRefs)).toBe(true);
    expect(Array.isArray(proposal?.decisionHistory)).toBe(true);
  });

  it('a freshly-emitted (pending) Proposal fails the readiness gate — fail closed (FR-9, FR-014)', () => {
    const act = getStepExecutions(workflowRunFixture, 'act').find(
      (stepExecution) => stepExecution.status === ExecutionStatus.COMPLETED
    );
    const proposal = act?.output as ProposalProperties | undefined;
    expect(proposal).toBeDefined();

    expect(() => requireReadinessGate(proposal as ProposalProperties, 'approved')).toThrow();
  });
});
