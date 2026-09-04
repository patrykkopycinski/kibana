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
export const runRuleTuningWorkflow = async ({
  fetch,
  log,
  maxWaitMs = 12 * 60_000,
  pollIntervalMs = 3_000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
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
        inputs: { min_fp_count: 1 },
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
      await fetch(`/api/workflows/executions/${workflowExecutionId}/resume`, {
        method: 'POST',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
        body: JSON.stringify({ input: { approved: true } }),
      });
      approvalResumed = true;
      log.info(`Auto-approved review_tuning gate for execution ${workflowExecutionId}`);
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

  // Reachability assert: if the run completed but produced no diagnose proposal, the LLM was
  // never invoked — almost always because the seeded rule failed the diagnose gate
  // (`fetch_rule.output.enabled == true`). Name the steps that DID run so the cause is visible
  // instead of degrading to a silent 0.
  if (!proposal?.change_type) {
    const stepsRun = (execution.stepExecutions ?? [])
      .map((s) => `${s.stepId}(${s.stepType})`)
      .join(', ');
    throw new Error(
      `Workflow execution ${workflowExecutionId} completed (status: ${execution.status}) but ` +
        `diagnose_rule produced no proposal — the seeded rule likely failed the diagnose gate ` +
        `(check it is enabled). Steps that ran: [${stepsRun}]`
    );
  }

  return {
    ...proposal,
    executionId: workflowExecutionId,
    executionStatus: execution.status,
  };
};
