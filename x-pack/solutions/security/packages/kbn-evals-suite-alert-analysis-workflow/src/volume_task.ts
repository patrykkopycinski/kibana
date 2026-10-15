/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  TerminalExecutionStatuses,
  type ExecutionStatus,
  type WorkflowExecutionDto,
  type WorkflowStepExecutionDto,
} from '@kbn/workflows';
import { ALERT_ANALYSIS_WORKFLOW_ID, WORKFLOWS_API_VERSION } from './constants';
import type { ClassificationMethod } from './workflow_task';
import type { ClassificationCall, RawVerdictLike } from './volume_verdicts';

const CLASSIFICATION_STEP_TYPES = ['ai.agent', 'ai.prompt'];
const CLASSIFICATION_STEP_IDS = ['runAgent_step', 'onechat_runAgent_step', 'runPrompt_step'];

/** Steps whose output the volume report reads besides the classification call itself. */
const DIAGNOSTIC_STEP_IDS = ['normalize_batch_result', 'filter_verdicts_to_batch', 'count_batch_result_verdicts'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isTerminal = (status: ExecutionStatus): boolean => TerminalExecutionStatuses.includes(status);

/**
 * The post-parse `data.set` steps echo the verdict arrays; keep only their sizes and ids so the
 * task output (and the golden doc) does not carry every rationale three times.
 */
const compactDiagnosticOutput = (output: unknown): unknown => {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    return output;
  }
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      compact[`${key}_count`] = value.length;
      compact[`${key}_ids`] = value.map((v) =>
        v != null && typeof v === 'object' ? (v as { id?: unknown }).id : v
      );
    } else if (typeof value === 'string') {
      compact[key] = value.slice(0, 300);
    } else {
      compact[key] = value;
    }
  }
  return compact;
};

const isClassificationStep = (step: WorkflowStepExecutionDto): boolean =>
  (step.stepType !== undefined && CLASSIFICATION_STEP_TYPES.includes(step.stepType)) ||
  CLASSIFICATION_STEP_IDS.includes(step.stepId);

/** The foreach iteration a step ran in: the innermost scope entered by the classify loop. */
const foreachIteration = (step: WorkflowStepExecutionDto): string | undefined => {
  const frame = (step.scopeStack ?? []).find((f) => f.stepId === 'classify_alert_batches');
  const scope = frame?.nestedScopes?.find((s) => /^\d+$/.test(s.scopeId ?? ''));
  return scope?.scopeId;
};

interface StepOutputLike {
  structured_output?: { verdicts?: RawVerdictLike[] };
  content?: { verdicts?: RawVerdictLike[] } | string;
  metadata?: { usage?: { inputTokens?: number; outputTokens?: number } };
}

const readCallVerdicts = (step: WorkflowStepExecutionDto): RawVerdictLike[] => {
  const output = step.output as StepOutputLike | null | undefined;
  const content = output?.content;
  const verdicts =
    output?.structured_output?.verdicts ??
    (content != null && typeof content === 'object' ? content.verdicts : undefined);
  if (!Array.isArray(verdicts)) {
    return [];
  }
  // Keep what the graders need (id, label, rationale length); drop the prose.
  return verdicts.map((verdict) => ({
    id: verdict?.id,
    classification: verdict?.classification,
    rationaleLength: typeof verdict?.rationale === 'string' ? verdict.rationale.length : 0,
  }));
};

export const toClassificationCall = (step: WorkflowStepExecutionDto): ClassificationCall => {
  const output = step.output as StepOutputLike | null | undefined;
  const usage = step.usage ?? output?.metadata?.usage;
  return {
    stepId: step.stepId,
    stepExecutionIndex: step.globalExecutionIndex ?? step.stepExecutionIndex ?? 0,
    scopeId: foreachIteration(step),
    status: step.status,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    executionTimeMs: step.executionTimeMs,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    errorText: step.error ? JSON.stringify(step.error).slice(0, 4000) : null,
    verdicts: readCallVerdicts(step),
  };
};

export interface VolumeLogLine {
  timestamp: string;
  level: string;
  message: string;
  stepId?: string;
}

export interface VolumeRunResult {
  alertIds: string[];
  executionId: string;
  executionStatus: ExecutionStatus;
  executionError: string | null;
  executionDurationMs: number | null;
  classificationMethod: ClassificationMethod;
  calls: ClassificationCall[];
  /** Raw output of the post-parse steps (one entry per foreach iteration), for the report. */
  diagnosticSteps: Array<{ stepId: string; scopeId?: string; output: unknown }>;
  /** warn/error lines of the execution log (out-of-schema warnings, retries, 400s, …). */
  logLines: VolumeLogLine[];
  /** Total log lines of the execution: the positive control for a zero warning count. */
  totalLogLines: number;
}

const readExecutionLogs = async (
  fetch: HttpHandler,
  executionId: string
): Promise<{ lines: VolumeLogLine[]; total: number }> => {
  const lines: VolumeLogLine[] = [];
  let total = 0;
  for (let page = 1; page <= 50; page++) {
    const response = (await fetch(`/api/workflows/executions/${executionId}/logs`, {
      method: 'GET',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      query: { size: 100, page },
    })) as {
      logs: Array<{ timestamp: string; level: string; message: string; stepId?: string }>;
      total: number;
    };
    total = response.total;
    for (const log of response.logs) {
      if (log.level === 'warn' || log.level === 'error') {
        lines.push({
          timestamp: log.timestamp,
          level: log.level,
          message: (log.message ?? '').slice(0, 4000),
          stepId: log.stepId,
        });
      }
    }
    if (response.logs.length < 100 || page * 100 >= total) {
      break;
    }
  }
  return { lines, total };
};

/**
 * Runs the managed workflow once for a whole rule execution of alerts (any size) and returns every
 * classification call it made, so a volume report can grade each chunk on its own.
 */
export const runAlertAnalysisVolumeWorkflow = async ({
  fetch,
  log,
  alertIds,
  alertIndex,
  classificationMethod,
  maxWaitMs = 45 * 60_000,
  pollIntervalMs = 5_000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  alertIds: string[];
  alertIndex: string;
  classificationMethod: ClassificationMethod;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<VolumeRunResult> => {
  const { workflowExecutionId } = (await fetch(
    `/api/workflows/workflow/${ALERT_ANALYSIS_WORKFLOW_ID}/run`,
    {
      method: 'POST',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      body: JSON.stringify({
        inputs: {
          event: {
            triggerType: 'alert',
            alertIds: alertIds.map((_id) => ({ _id, _index: alertIndex })),
          },
        },
      }),
    }
  )) as { workflowExecutionId: string };

  log.info(
    `Started alert-analysis volume execution ${workflowExecutionId} for ${alertIds.length} alerts`
  );

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
      `Volume execution ${workflowExecutionId} not terminal after ${maxWaitMs}ms (status ${execution.status})`
    );
  }

  const calls = execution.stepExecutions.filter(isClassificationStep).map(toClassificationCall);
  const diagnosticSteps = execution.stepExecutions
    .filter((step) => DIAGNOSTIC_STEP_IDS.includes(step.stepId))
    .map((step) => ({
      stepId: step.stepId,
      scopeId: foreachIteration(step),
      output: compactDiagnosticOutput(step.output),
    }));

  let logs: { lines: VolumeLogLine[]; total: number } = { lines: [], total: -1 };
  try {
    logs = await readExecutionLogs(fetch, workflowExecutionId);
  } catch (error) {
    // total = -1 marks "logs unreadable" so a zero warning count is never mistaken for clean.
    log.warning(`Could not read logs for ${workflowExecutionId}: ${(error as Error).message}`);
  }

  log.info(
    `Volume execution ${workflowExecutionId}: status=${execution.status} calls=${calls.length} ` +
      `raw=[${calls.map((c) => `${c.verdicts.length}${c.errorText ? '!' : ''}`).join(',')}] ` +
      `warn/error logs=${logs.lines.length}/${logs.total}`
  );

  return {
    alertIds,
    executionId: workflowExecutionId,
    executionStatus: execution.status,
    executionError: execution.error ? JSON.stringify(execution.error).slice(0, 4000) : null,
    executionDurationMs: execution.duration ?? null,
    classificationMethod,
    calls,
    diagnosticSteps,
    logLines: logs.lines,
    totalLogLines: logs.total,
  };
};
