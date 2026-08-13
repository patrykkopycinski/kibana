/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { z } from '@kbn/zod';
import { readAgentToolCallsFromTraces } from '@kbn/security-evals-workflow-traces';
import {
  ExecutionStatus,
  TerminalExecutionStatuses,
  type WorkflowExecutionDto,
  type WorkflowStepExecutionDto,
} from '@kbn/workflows';

interface AgentConversationId {
  conversationId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const extractAgentConversationIds = (
  stepExecutions: WorkflowStepExecutionDto[]
): AgentConversationId[] => {
  const seen = new Set<string>();
  const conversationIds: AgentConversationId[] = [];

  for (const step of stepExecutions) {
    if (step.stepType === 'ai.agent' && isRecord(step.output)) {
      const conversationId = step.output.conversation_id;
      if (
        typeof conversationId === 'string' &&
        conversationId.length > 0 &&
        !seen.has(conversationId)
      ) {
        seen.add(conversationId);
        conversationIds.push({ conversationId });
      }
    }
  }

  return conversationIds;
};

import { RULE_CREATION_WORKFLOW_ID, WORKFLOWS_API_VERSION } from './constants';
import { draftRuleSchema, type DraftRule } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Per-example budget. The suite runs 4 golden + 3 hard examples serially through
// runExperiment, so this must leave the whole dataset inside the Playwright `timeout` in
// playwright.config.ts — otherwise the test is killed mid-run and reports no scores at all
// rather than reporting a slow run's scores.
export const DEFAULT_MAX_WAIT_MS = 5 * 60_000;

// WAITING_FOR_INPUT is in NonTerminalExecutionStatuses in @kbn/workflows, so we
// must add it explicitly — otherwise the poll loop spins for maxWaitMs waiting
// for a workflow that is intentionally paused waiting for human approval.
const shouldStopPolling = (status: ExecutionStatus) =>
  TerminalExecutionStatuses.includes(status) || status === ExecutionStatus.WAITING_FOR_INPUT;

const stepOutputSchema = z.object({ structured_output: draftRuleSchema }).partial();

// Each step produces two entries in stepExecutions: an "enter" record (output: null)
// and a "result" record (output: data). Find the result record for draft_creation.
//
// `stepId` is derived from the step's `name:` in the workflow yaml (see the workflow execution
// engine's step-graph builder), so this matches `- name: draft_creation` in
// @kbn/workflows/managed .../rule_creation/rule_creation_workflow.yaml. If that step is renamed,
// this returns undefined and every evaluator reports N/A rather than a false zero.
const DRAFT_STEP_ID = 'draft_creation';
const CREATE_RULE_STEP_ID = 'create_rule';

const extractRuleFromSteps = (steps: WorkflowStepExecutionDto[]): DraftRule | undefined => {
  const draftSteps = steps.filter((s) => s.stepId === DRAFT_STEP_ID);
  const resultRecord = draftSteps.find((s) => s.output != null);
  const parsed = stepOutputSchema.safeParse(resultRecord?.output);
  return parsed.success ? parsed.data.structured_output : undefined;
};

/**
 * Conversation id of the `ai.agent` step, used to correlate the run with the agent's tool spans.
 *
 * This is the join key that makes `Tool Routing` measurable. The agent invocation opens its own
 * root trace, so the workflow's `traceId` matches zero agent spans; the conversation id is carried
 * both here and on every agent span as `gen_ai.conversation.id`.
 *
 * Note `draft_creation` appears TWICE in `stepExecutions` — once as the `step_level_timeout`
 * wrapper (whose output is null) and once as the real `ai.agent` step. Filtering on stepId alone
 * can pick the wrapper and silently yield undefined, so key off the output shape.
 */
export interface RuleCreationResult {
  rule: DraftRule | undefined;
  /** True when the workflow halted at the human approval gate, as it must for an unattended run. */
  pendingApproval: boolean;
  /**
   * True when the detection-engine write step ran. Under an unattended eval this must always be
   * false — the approval gate is a hard kill criterion, so a true here is a product defect, not a
   * quality score.
   */
  ruleWritten: boolean;
  executionStatus: ExecutionStatus;
  traceId: string | undefined;
  toolCallIds: string[];
  /** Subset of {@link toolCallIds} whose span reported `status.code == "Error"`. */
  failedToolCallIds: string[];
  toolCallsUnavailable: boolean;
}

export class RuleCreationClient {
  private readonly pendingExecutionIds: string[] = [];
  private executionCount = 0;
  private unavailableCount = 0;

  /**
   * Fails the suite when routing was never actually measured.
   *
   * This suite records scores to ES and asserts nothing in the spec, so a Playwright "2 passed"
   * only means the harness completed. Verified 2026-08-11 by forcing `toolCallsUnavailable: true`:
   * the run still reported EVALS_RC=0 / "2 passed" with Tool Routing and Trajectory Efficiency
   * showing "-", because null scores are dropped from `extended_stats` aggregates rather than
   * counted as 0. A broken trace pipeline in CI is therefore indistinguishable from a perfect run.
   *
   * Coverage is asserted separately from score: a low score is a real result worth reporting,
   * whereas no measurement at all is a broken harness and must go red.
   *
   * The bar is every execution, not merely one. An all-or-nothing check passes a run where 7 of 8
   * executions lost their traces, reporting routing from the single survivor as if it covered the
   * dataset — a partial pipeline failure is still a failure, and averaging over whichever runs
   * happened to correlate silently changes what the number means.
   */
  assertRoutingWasMeasured(): void {
    if (this.executionCount === 0) {
      throw new Error('No workflow executions were recorded — the suite measured nothing.');
    }
    if (this.unavailableCount > 0) {
      const measured = this.executionCount - this.unavailableCount;
      throw new Error(
        `Tool-call traces were unavailable for ${this.unavailableCount} of ${this.executionCount} ` +
          `execution(s) (only ${measured} correlated), so routing and trajectory scored N/A for ` +
          `those runs and were dropped from the report rather than counted as 0. This is a harness ` +
          `failure (trace ES unreachable, or conversation ids not correlating), not a passing run.`
      );
    }
  }

  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly traceEsClient?: EsClient
  ) {}

  async run({
    input,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    pollIntervalMs = 5_000,
  }: {
    input: {
      technique: string;
      gap_description: string;
      evidence: string;
      confidence: number;
    };
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }): Promise<RuleCreationResult> {
    const { workflowExecutionId } = await this.fetch<{ workflowExecutionId: string }>(
      `/api/workflows/workflow/${RULE_CREATION_WORKFLOW_ID}/run`,
      {
        method: 'POST',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
        body: JSON.stringify({ inputs: input }),
      }
    );

    this.log.info(`Started rule-creation workflow execution ${workflowExecutionId}`);
    this.pendingExecutionIds.push(workflowExecutionId);

    const deadline = Date.now() + maxWaitMs;
    let execution: WorkflowExecutionDto | undefined;

    while (Date.now() < deadline) {
      execution = await this.fetch<WorkflowExecutionDto>(
        `/api/workflows/executions/${workflowExecutionId}`,
        {
          method: 'GET',
          version: WORKFLOWS_API_VERSION,
          headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
          query: { includeOutput: true },
        }
      );

      if (shouldStopPolling(execution.status)) break;
      await sleep(pollIntervalMs);
    }

    if (!execution) {
      throw new Error(`No execution returned for workflow run ${workflowExecutionId}`);
    }

    if (!shouldStopPolling(execution.status)) {
      this.log.warning(
        `Workflow ${workflowExecutionId} did not reach a terminal state within ${maxWaitMs}ms (last status: ${execution.status})`
      );
    }

    const stepExecutions = execution.stepExecutions ?? [];
    const rule = extractRuleFromSteps(stepExecutions);

    if (!rule) {
      // Hard-fail rather than warn. A crashed workflow yields N/A on every evaluator, and an
      // all-N/A run is indistinguishable from a clean pass at the spec level — measured: a run
      // where 3/4 workflows died with version_conflict_engine_exception still reported
      // "2 passed" / exit 0. Infrastructure failure must be red, not silently unmeasured.
      throw new Error(
        `Workflow ${workflowExecutionId} reached ${execution.status} but ${DRAFT_STEP_ID} produced no rule. ` +
          `Every evaluator would report N/A, so this run measures nothing. ` +
          `Execution error: ${JSON.stringify(execution.error ?? null)}`
      );
    }

    const conversationIds = extractAgentConversationIds(stepExecutions).map(
      ({ conversationId }) => conversationId
    );

    const {
      toolCallIds,
      failedToolCallIds = [],
      unavailable,
    } = await readAgentToolCallsFromTraces({
      traceEsClient: this.traceEsClient,
      conversationIds,
      log: this.log,
      includeFailures: true,
    });

    // Track routing coverage so the suite can distinguish "routing was measured and passed" from
    // "routing was never measured". See assertRoutingWasMeasured below.
    this.executionCount += 1;
    if (unavailable) {
      this.unavailableCount += 1;
    }

    return {
      rule,
      pendingApproval: execution.status === ExecutionStatus.WAITING_FOR_INPUT,
      // The eval never approves, so create_rule must never have executed. Any step execution
      // record for it means the approval gate did not hold.
      ruleWritten: stepExecutions.some((s) => s.stepId === CREATE_RULE_STEP_ID),
      executionStatus: execution.status,
      traceId: execution.traceId,
      toolCallIds,
      failedToolCallIds,
      toolCallsUnavailable: unavailable,
    };
  }

  async cancelPending(): Promise<void> {
    await Promise.allSettled(
      this.pendingExecutionIds.map((id) =>
        this.fetch(`/api/workflows/executions/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
          version: WORKFLOWS_API_VERSION,
          headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
        }).then(() => this.log.debug(`Cancelled workflow execution ${id}`))
      )
    );
    this.pendingExecutionIds.length = 0;
  }
}
