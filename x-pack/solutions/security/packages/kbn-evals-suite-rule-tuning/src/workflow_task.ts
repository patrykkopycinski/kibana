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
 * Public License v1 as approved by ....... Use, modification, and distribution
 * are permitted under the Elastic License 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import type {
  ExecutionStatus,
  WorkflowExecutionDto,
  WorkflowStepExecutionDto,
} from '@kbn/workflows';
import { RULE_TUNING_WORKFLOW_ID, WORKFLOWS_API_VERSION, type ChangeType } from './constants';

/**
 * Structured output the workflow's `diagnose_rule` ai.agent step is schema-constrained to
 * return (see rule_tuning.yaml). Field names mirror the workflow schema exactly so this
 * interface drifts loudly against the workflow definition, not silently.
 */
export interface TuningStructuredOutput {
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

/** Task output graded by the suite's evaluators. */
export interface RuleTuningProposal extends TuningStructuredOutput {
  executionId: string;
  executionStatus: ExecutionStatus;
}

/** The diagnose step whose structured output we grade (matched by name; stable in rule_tuning.yaml). */
const DIAGNOSE_STEP_ID = 'diagnose_rule';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readDiagnoseStructuredOutput = (
  stepExecutions: WorkflowStepExecutionDto[]
): TuningStructuredOutput | undefined => {
  const diagnoseSteps = stepExecutions.filter((step) => step.stepId === DIAGNOSE_STEP_ID);
  for (const step of diagnoseSteps) {
    const output = step.output as { structured_output?: TuningStructuredOutput } | null | undefined;
    if (output?.structured_output) {
      return output.structured_output;
    }
  }
  return undefined;
};

/**
 * Triggers the managed rule-tuning workflow once (interval trigger semantics: the workflow
 * harvests rules whose alerts analysts closed as false positives) and polls the execution
 * until terminal, returning the diagnose step's structured proposal.
 *
 * The caller seeds rules + FP-alert dispositions before invoking (see the eval spec); this
 * function only runs and reads.
 */
export const runRuleTuningWorkflow = async ({
  fetch,
  log,
  minFpCount = 1,
  timeoutMs = 10 * 60 * 1000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  minFpCount?: number;
  timeoutMs?: number;
}): Promise<RuleTuningProposal> => {
  const startResponse = await fetch.post<{ id: string }>({
    path: `/internal/workflows/${RULE_TUNING_WORKFLOW_ID}/run`,
    headers: { 'Elastic-Api-Version': WORKFLOWS_API_VERSION },
    body: { inputs: { min_fp_count: minFpCount } },
  });
  const executionId = startResponse.id;
  log.info(`rule-tuning workflow execution ${executionId} started`);

  const deadline = Date.now() + timeoutMs;
  let execution: WorkflowExecutionDto | undefined;
  while (Date.now() < deadline) {
    const pollResponse = await fetch.get<WorkflowExecutionDto>({
      path: `/internal/workflows/executions/${executionId}`,
      headers: { 'Elastic-Api-Version': WORKFLOWS_API_VERSION },
    });
    execution = pollResponse;
    const status: ExecutionStatus = execution.status as ExecutionStatus;
    if (['completed', 'failed', 'cancelled', 'skipped'].includes(status as string)) {
      break;
    }
    await sleep(10_000);
  }

  if (!execution) {
    throw new Error(`rule-tuning workflow execution ${executionId} never returned a status`);
  }

  const structuredOutput = readDiagnoseStructuredOutput(
    (execution as unknown as { stepExecutions?: WorkflowStepExecutionDto[] }).stepExecutions ?? []
  );
  if (execution.status === 'completed' && !structuredOutput) {
    log.warning(`execution ${executionId} completed without a diagnose_rule structured output`);
  }

  return {
    ...structuredOutput,
    executionId,
    executionStatus: execution.status as ExecutionStatus,
  };
};
