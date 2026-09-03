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
  type ExecutionStatus,
  type WorkflowExecutionDto,
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

  // The workflow's review_tuning step is a 72h human-approval gate; a run parks in a
  // non-terminal `waiting` status there. Because schedule_workflow skips new runs while
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

    if (!approvalResumed && execution.status === 'waiting') {
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

  if (!proposal?.change_type) {
    log.warning(
      `Workflow execution ${workflowExecutionId} produced no change_type (status: ${execution.status})`
    );
  }

  return {
    ...proposal,
    executionId: workflowExecutionId,
    executionStatus: execution.status,
  };
};
