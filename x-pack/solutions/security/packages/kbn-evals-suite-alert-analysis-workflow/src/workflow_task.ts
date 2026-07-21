/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  TerminalExecutionStatuses,
  type ExecutionStatus,
  type WorkflowExecutionDto,
  type WorkflowStepExecutionDto,
  type WorkflowTokenUsage,
} from '@kbn/workflows';
import { readWorkflowAgentToolCalls } from './read_workflow_agent_tool_calls';
import {
  ALERT_ANALYSIS_WORKFLOW_ID,
  WORKFLOWS_API_VERSION,
  type Classification,
} from './constants';

/**
 * The `ai.agent` step in alert_analysis_workflow.yaml whose structured output we grade. We match on
 * `stepType` rather than the step's name so the harness survives step renames in the workflow
 * definition (the step has been called both `onechat_runAgent_step` and `runAgent_step`). The name
 * list is a fallback for execution records that omit `stepType`.
 */
const AGENT_STEP_TYPE = 'ai.agent';
const AGENT_STEP_ID_FALLBACKS = ['runAgent_step', 'onechat_runAgent_step'];

const isAgentStep = (step: WorkflowStepExecutionDto): boolean =>
  step.stepType === AGENT_STEP_TYPE ||
  (step.stepType === undefined && AGENT_STEP_ID_FALLBACKS.includes(step.stepId));

/** Structured output the workflow's `ai.agent` step is schema-constrained to return. */
interface StructuredOutput {
  classification?: Classification;
  confidence_score?: number;
  rationale?: string;
  contributing_factors?: string[];
}

/**
 * Task output graded by the suite's evaluators. `classification` is undefined when the
 * workflow failed or the agent step did not produce a verdict — the evaluators treat that
 * as an invalid/incorrect verdict rather than throwing.
 */
export interface AlertAnalysisVerdict {
  classification?: Classification;
  confidenceScore?: number;
  rationale?: string;
  contributingFactors?: string[];
  executionId: string;
  executionStatus: ExecutionStatus;
  traceId?: string;
  /** Ordered agent tool IDs from OTel TOOL spans on the workflow execution trace. */
  toolCallIds?: string[];
  /** True when trace ES was unreachable or the workflow trace id was invalid. */
  toolCallsUnavailable?: boolean;
  /**
   * Normalized LLM token usage for the run, read from the workflow execution record.
   * The workflow sums per-step usage into `execution.usage`; we prefer that and fall
   * back to the agent step's own `usage` when the summary is absent. Undefined when the
   * execution reported no usage (e.g. the agent step never ran).
   */
  usage?: WorkflowTokenUsage;
  /** Wall-clock duration of the whole workflow execution in ms (`execution.duration`). */
  latencyMs?: number;
  /** Wall-clock duration of just the graded `ai.agent` step in ms (`executionTimeMs`). */
  agentLatencyMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTerminal = (status: ExecutionStatus): boolean => TerminalExecutionStatuses.includes(status);

/**
 * Reads the agent step's structured output. Each step yields multiple execution records (an
 * enter record whose `output` is null and the record that carries the result), and both report
 * status `completed`, so we cannot key off status alone. We seed one alert per run, so there is a
 * single logical agent step: scan every agent-step record and return the first
 * `structured_output` payload we find.
 */
const readAgentStructuredOutput = (
  stepExecutions: WorkflowStepExecutionDto[]
): StructuredOutput | undefined => {
  const agentSteps = stepExecutions.filter(isAgentStep);
  for (const step of agentSteps) {
    const output = step.output as { structured_output?: StructuredOutput } | null | undefined;
    if (output?.structured_output) {
      return output.structured_output;
    }
  }
  return undefined;
};

/**
 * Reads token usage for the run. Prefers the workflow-summed `execution.usage`, which the
 * engine populates by summing per-step usage. When that summary is absent (older execution
 * records), falls back to the agent step's own `usage`, then to the step output's
 * `metadata.usage` (the shape the workflow YAML reads). Undefined when no source reported usage.
 */
export const readAgentUsage = (execution: WorkflowExecutionDto): WorkflowTokenUsage | undefined => {
  if (execution.usage) {
    return execution.usage;
  }
  for (const step of execution.stepExecutions.filter(isAgentStep)) {
    if (step.usage) {
      return step.usage;
    }
    const metadataUsage = (
      step.output as { metadata?: { usage?: WorkflowTokenUsage } } | null | undefined
    )?.metadata?.usage;
    if (metadataUsage) {
      return metadataUsage;
    }
  }
  return undefined;
};

/**
 * Wall-clock duration of the graded `ai.agent` step. Each step yields multiple execution
 * records; we take the largest reported `executionTimeMs` across agent-step records so an
 * enter/exit record pair (the enter record reports 0) does not undercount the step.
 */
export const readAgentStepLatency = (
  stepExecutions: WorkflowStepExecutionDto[]
): number | undefined => {
  const times = stepExecutions
    .filter(isAgentStep)
    .map((step) => step.executionTimeMs)
    .filter((ms): ms is number => typeof ms === 'number');
  return times.length > 0 ? Math.max(...times) : undefined;
};

/**
 * Runs the managed alert-analysis workflow end-to-end for a single seeded alert and
 * returns the agent's verdict.
 *
 * Uses the production `alert` trigger path: passing `triggerType: 'alert'` + `alertIds`
 * makes the run route fetch the alert from ES and build the standardized event
 * (see `preprocessAlertInputs`), exactly as the `.workflows` rule connector does.
 */
export const runAlertAnalysisWorkflow = async ({
  fetch,
  log,
  traceEsClient,
  alertId,
  alertIndex,
  metadata,
  maxWaitMs = 12 * 60_000,
  pollIntervalMs = 3_000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  traceEsClient?: EsClient;
  alertId: string;
  alertIndex: string;
  /** Optional eval metadata forwarded to the agent execution via x-eval-* headers so
   *  golden-cluster traces can be correlated back to the specific example and run. */
  metadata?: { runId?: string; exampleId?: string; modelId?: string };
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<AlertAnalysisVerdict> => {
  const headers: Record<string, string> = { 'elastic-api-version': WORKFLOWS_API_VERSION };
  if (metadata?.runId) {
    headers['x-eval-run-id'] = metadata.runId;
  }
  if (metadata?.exampleId) {
    headers['x-eval-example-id'] = metadata.exampleId;
  }
  if (metadata?.modelId) {
    headers['x-eval-model-id'] = metadata.modelId;
  }

  const { workflowExecutionId } = (await fetch(
    `/api/workflows/workflow/${ALERT_ANALYSIS_WORKFLOW_ID}/run`,
    {
      method: 'POST',
      version: WORKFLOWS_API_VERSION,
      headers,
      body: JSON.stringify({
        inputs: {
          event: {
            triggerType: 'alert',
            alertIds: [{ _id: alertId, _index: alertIndex }],
          },
        },
      }),
    }
  )) as { workflowExecutionId: string };

  log.info(`Started alert-analysis workflow execution ${workflowExecutionId} for alert ${alertId}`);

  const deadline = Date.now() + maxWaitMs;
  let execution: WorkflowExecutionDto | undefined;

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

    await sleep(pollIntervalMs);
  }

  if (!execution) {
    throw new Error(`No execution returned for workflow run ${workflowExecutionId}`);
  }

  if (!isTerminal(execution.status)) {
    log.warning(
      `Workflow execution ${workflowExecutionId} did not reach a terminal status within ${maxWaitMs}ms (last status: ${execution.status})`
    );
  }

  const structured = readAgentStructuredOutput(execution.stepExecutions);

  if (!structured?.classification) {
    log.warning(
      `Workflow execution ${workflowExecutionId} produced no classification (status: ${execution.status})`
    );
  }

  const { toolCallIds, unavailable } = traceEsClient
    ? await readWorkflowAgentToolCalls({
        traceEsClient,
        traceId: execution.traceId,
        log,
      })
    : { toolCallIds: undefined, unavailable: true };

  if (toolCallIds && toolCallIds.length > 0) {
    log.warning(
      `Workflow agent called unexpected tools: ${toolCallIds.join(
        ', '
      )} (execution ${workflowExecutionId})`
    );
  }

  return {
    classification: structured?.classification,
    confidenceScore: structured?.confidence_score,
    rationale: structured?.rationale,
    contributingFactors: structured?.contributing_factors,
    executionId: workflowExecutionId,
    executionStatus: execution.status,
    traceId: execution.traceId,
    toolCallIds,
    toolCallsUnavailable: unavailable,
    usage: readAgentUsage(execution),
    latencyMs: execution.duration ?? undefined,
    agentLatencyMs: readAgentStepLatency(execution.stepExecutions),
  };
};
