/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0, the GNU Affero General Public License v3.0 only, or the Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the GNU AGPL v3.0 or the SSPL v1.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { HttpHandler } from '@kbn/core/public';
import {
  TerminalExecutionStatuses,
  NonTerminalExecutionStatuses,
  ExecutionStatus,
  type WorkflowExecutionDto,
  type WorkflowExecutionListDto,
  type WorkflowStepExecutionDto,
} from '@kbn/workflows';
import { RULE_TUNING_WORKFLOW_ID, WORKFLOWS_API_VERSION, type ChangeType } from './constants';

/**
 * The `ai.agent` step (diagnose_rule) whose structured output we grade. Matched on
 * `stepType` so the harness survives step renames in the workflow definition.
 */
const AGENT_STEP_TYPE = 'ai.agent';

/** Structured output the diagnose step is schema-constrained to return. */
export interface RuleTuningProposal {
  change_type?: ChangeType;
  summary?: string;
  exception_entries?: Array<{
    field?: string;
    operator?: string;
    value?: string;
    values?: string[];
  }>;
  proposed_query?: string;
  suppression_group_by?: string[];
  proposed_risk_score?: number;
  proposed_severity?: string;
}

/** Verdict graded by the suite's evaluators: the diagnose proposal plus run metadata. */
export interface RuleTuningVerdict extends RuleTuningProposal {
  executionId: string;
  executionStatus: ExecutionStatus;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTerminal = (status: ExecutionStatus): boolean => TerminalExecutionStatuses.includes(status);

/**
 * True while an execution is parked on the review_tuning human-approval gate.
 *
 * The gate reports `waiting_for_input`, not `waiting` — an earlier bare-string check for
 * 'waiting' alone never matched, so every run sat at the gate until the next task's
 * stale-cancel killed it and no fixture ever scored. Exported so a test pins the contract.
 */
export const isAwaitingApproval = (status: ExecutionStatus): boolean =>
  status === ExecutionStatus.WAITING_FOR_INPUT || status === ExecutionStatus.WAITING;

/**
 * True for the 409 the resume route returns when an execution has reached `waiting_for_input`
 * but its waiting STEP row is not queryable yet.
 *
 * `resumeWorkflowExecution` resolves the waiting step via `getWaitingStepExecutionId` and
 * rejects with `is in status "waiting step not found" but expected "waiting_for_input"` when
 * that lookup comes back empty. That is a read-after-write race the harness should re-poll
 * through, not a real conflict — so this stays narrow. An "already responded to" 409 (a genuine
 * double-approval) does NOT match and still fails the run.
 */
export const isWaitingStepNotReady = (error: unknown): boolean =>
  /waiting step not found/.test(String((error as { message?: unknown })?.message ?? error));

/**
 * Polls until this workflow has no non-terminal executions left.
 *
 * `/executions/cancel` returns before the runtime has actually torn the executions down, and
 * the workflow is `concurrency: max 1, drop` — scheduling into a non-drained backlog gets the
 * new run SKIPPED, which reads downstream as a legitimate 0 score.
 */
const waitForNoActiveExecutions = async ({
  fetch,
  log,
  pollIntervalMs,
  timeoutMs = 60_000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  pollIntervalMs: number;
  timeoutMs?: number;
}): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { results = [] } = (await fetch(
      `/api/workflows/workflow/${RULE_TUNING_WORKFLOW_ID}/executions`,
      {
        method: 'GET',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
        query: { statuses: [...NonTerminalExecutionStatuses] },
      }
    )) as unknown as WorkflowExecutionListDto;

    if (results.length === 0) return;
    await sleep(pollIntervalMs);
  }
  log.warning(`Stale executions still active after ${timeoutMs}ms; scheduling anyway`);
};

/**
 * True for executions the runtime never actually ran — dropped by `concurrency: max 1` or
 * cancelled. Scoring these 0 would report an infrastructure collision as a model failure.
 */
export const neverRan = (status: ExecutionStatus): boolean =>
  status === ExecutionStatus.SKIPPED || status === ExecutionStatus.CANCELLED;

const readDiagnoseStructuredOutput = (
  stepExecutions: WorkflowStepExecutionDto[]
): RuleTuningProposal | undefined => {
  const agentSteps = stepExecutions.filter((step) => step.stepType === AGENT_STEP_TYPE);
  for (const step of agentSteps) {
    const output = step.output as { structured_output?: RuleTuningProposal } | null | undefined;
    if (output?.structured_output) {
      return output.structured_output;
    }
  }
  return undefined;
};

/**
 * Runs the managed rule-tuning workflow end-to-end for one seeded FP rule and returns the
 * diagnose step's proposal. The sweep is scheduled; we trigger it via the run route with
 * `min_fp_count: 1` so the seeded rule is harvested in the same execution.
 */
/**
 * Explain why a completed execution produced no proposal.
 *
 * Two causes are indistinguishable in the score (both yield 0) but demand opposite responses:
 * an agent step that ran out of time is a real model result, while a rule that failed the
 * diagnose gate is a fixture bug. The step list already carries the distinction, so classify it
 * here instead of asserting one cause and sending the reader to check the wrong thing.
 */
export const explainMissingProposal = (
  steps: Array<{ stepId: string; stepType?: string }>
): string => {
  const stepsRun = steps.map((s) => `${s.stepId}(${s.stepType})`).join(', ');
  const cause = steps.some((s) => s.stepType === 'step_level_timeout')
    ? `diagnose_rule hit its step timeout before proposing — the model was too slow to decide, not a seeding failure`
    : `diagnose_rule produced no proposal — the seeded rule likely failed the diagnose gate (check it is enabled)`;
  return `${cause}. Steps that ran: [${stepsRun}]`;
};

export const runRuleTuningWorkflow = async ({
  fetch,
  log,
  connectorId,
  maxWaitMs = 12 * 60_000,
  pollIntervalMs = 3_000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  /**
   * Connector the workflow's `diagnose_rule` ai.agent step must run on. Required so each
   * Playwright project actually evaluates its own model: with no `connector-id` on the
   * step, `resolveConnectorOrInferenceId` returns undefined and the step silently falls
   * back to the space default agent — every model project would score one same model.
   */
  connectorId: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<{
  executionId: string;
  executionStatus: ExecutionStatus;
  proposal?: RuleTuningProposal;
}> => {
  // A scheduled sweep of this workflow may be in flight (pending/running/waiting at the
  // review_tuning HITL gate). schedule_workflow SKIPS any new run while ANY non-terminal
  // execution exists, so a boot-time sweep poisons every eval run with SKIPPED. Cancel
  // stale executions first — do NOT resume them (their inputs are not ours).
  const stale = (await fetch(`/api/workflows/workflow/${RULE_TUNING_WORKFLOW_ID}/executions`, {
    method: 'GET',
    version: WORKFLOWS_API_VERSION,
    headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
    query: { statuses: [...NonTerminalExecutionStatuses] },
  })) as unknown as WorkflowExecutionListDto;

  if ((stale.results ?? []).length > 0) {
    // Route cancels ALL active executions of this workflow (no body needed).
    await fetch(`/api/workflows/workflow/${RULE_TUNING_WORKFLOW_ID}/executions/cancel`, {
      method: 'POST',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
    });
    log.info(`Cancelled ${stale.results.length} stale non-terminal execution(s) before scheduling`);

    // Cancellation is async. Scheduling before it settles means concurrency (max:1, drop)
    // silently SKIPS our run — the first fixtures of a suite scored 0 on `status: skipped`
    // while later ones passed. Wait for the backlog to actually drain.
    await waitForNoActiveExecutions({ fetch, log, pollIntervalMs });
  }

  const { workflowExecutionId } = (await fetch(
    `/api/workflows/workflow/${RULE_TUNING_WORKFLOW_ID}/run`,
    {
      method: 'POST',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      body: JSON.stringify({
        inputs: { min_fp_count: 1, connector_id: connectorId },
      }),
    }
  )) as { workflowExecutionId: string };

  log.info(`Started rule-tuning workflow execution ${workflowExecutionId}`);

  const deadline = Date.now() + maxWaitMs;
  let execution: WorkflowExecutionDto | undefined;

  // The workflow's review_tuning step is a 72h human-approval gate; a run parks there in the
  // non-terminal `waiting_for_input` status. Because schedule_workflow skips new runs while
  // a non-terminal execution exists, an un-approved run also poisons every later run.
  // The eval drives the full production path, then auto-approves the gate exactly like
  // the external resume URL does (input: { approved: true }).
  let approvalResumed = false;

  while (Date.now() < deadline) {
    execution = (await fetch(`/api/workflows/executions/${workflowExecutionId}`, {
      method: 'GET',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      query: { includeOutput: true },
    })) as WorkflowExecutionDto;

    if (isTerminal(execution.status)) {
      break;
    }

    // The HITL gate parks the run in `waiting_for_input` (ExecutionStatus.WAITING_FOR_INPUT),
    // NOT `waiting` — see isAwaitingApproval.
    // Log the exact status string the gate saw so a stall names itself: if this loops on an
    // unexpected value (e.g. a new ExecutionStatus the harness doesn't resume on), the log
    // shows it instead of silently polling until timeout.
    if (!approvalResumed) {
      log.info(`Execution ${workflowExecutionId} status: ${execution.status}`);
    }
    if (!approvalResumed && isAwaitingApproval(execution.status)) {
      // The execution reaching `waiting_for_input` does not guarantee its waiting STEP row is
      // queryable yet. `resumeWorkflowExecution` looks that step up and, when it is not there,
      // rejects with 409 `waiting step not found` -- a read-after-write race, not a real
      // conflict. Treat it as "not ready yet" and re-poll instead of burning the whole suite:
      // leaving approvalResumed false lets the next iteration retry the approval.
      try {
        await fetch(`/api/workflows/executions/${workflowExecutionId}/resume`, {
          method: 'POST',
          version: WORKFLOWS_API_VERSION,
          headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
          body: JSON.stringify({ input: { approved: true } }),
        });
        approvalResumed = true;
        log.info(`Auto-approved review_tuning gate for execution ${workflowExecutionId}`);
      } catch (error) {
        if (!isWaitingStepNotReady(error)) {
          throw error;
        }
        log.info(
          `Approval gate for execution ${workflowExecutionId} is not resumable yet ` +
            `(waiting step not persisted); retrying after ${pollIntervalMs}ms`
        );
      }
      await sleep(pollIntervalMs); // resume is async; give it a beat before re-poll
    } else {
      await sleep(pollIntervalMs);
    }
  }

  // The diagnose proposal is already persisted in stepExecutions at approval time, but
  // read it after the run settles so post-gate steps (mark_alerts_applied) cannot race.

  if (!execution) {
    throw new Error(`No execution returned for workflow run ${workflowExecutionId}`);
  }

  if (!isTerminal(execution.status)) {
    log.warning(
      `Workflow execution ${workflowExecutionId} did not reach a terminal status within ${maxWaitMs}ms (last status: ${execution.status})`
    );
  }

  const proposal = readDiagnoseStructuredOutput(execution.stepExecutions);

  // A run the runtime never executed (skipped by concurrency, or cancelled) carries no
  // proposal. Scoring it 0 would report an infrastructure collision as a model failure, so
  // fail loudly instead — an accurate low score is only meaningful if the run actually ran.
  if (neverRan(execution.status)) {
    throw new Error(
      `Workflow execution ${workflowExecutionId} never ran (status: ${execution.status}) — ` +
        `concurrency collision, not a model result.`
    );
  }

  // Reachability assert: if the run completed but produced no diagnose proposal, distinguish the
  // two causes the step list can already tell apart — the agent step timing out (a real model
  // result: too slow to decide) versus the seeded rule failing the diagnose gate
  // (`fetch_rule.output.enabled == true`, a fixture bug). Naming the wrong one sends the reader
  // to check rule seeding when the model actually exceeded its step budget.
  if (!proposal?.change_type) {
    throw new Error(
      `Workflow execution ${workflowExecutionId} completed (status: ${
        execution.status
      }) but ${explainMissingProposal(execution.stepExecutions ?? [])}`
    );
  }

  return {
    ...proposal,
    executionId: workflowExecutionId,
    executionStatus: execution.status,
  };
};
