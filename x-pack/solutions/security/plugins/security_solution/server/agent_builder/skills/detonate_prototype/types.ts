/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — shared tool helpers.
 *
 * The result shapes mirror the response-actions skill's conventions so the two
 * endpoint skills answer in the same vocabulary.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';

import type { DetonateTask } from '../../../../common/detonate_prototype';
import {
  detonationProgress,
  detonationWasQuiet,
  isDetonationComplete,
  isDetonationFailed,
  totalDetonationAlerts,
} from '../../../../common/detonate_prototype';

/** Bounds on free-text tool arguments, so an LLM cannot build an oversized request. */
export const MAX_SAMPLE_HASH_LENGTH = 128;
export const MIN_SAMPLE_HASH_LENGTH = 32;
export const MAX_TAG_LENGTH = 256;
export const MAX_TAGS = 32;
export const MAX_TASK_ID_LENGTH = 256;
export const MAX_QUERY_STRING_LENGTH = 1024;

/** One page of tasks for `list_detonations`. */
export const LIST_DETONATIONS_PAGE_SIZE = 20;

/**
 * Alert groups reported per telemetry bucket. A detonation of a noisy sample
 * can raise dozens of distinct `event.code` groups; the summary reports the
 * total alongside the bounded sample so nothing is silently lost.
 */
export const MAX_ALERT_GROUPS = 20;

/**
 * Result-token ceiling per tool. A detonation summary is small by construction
 * (counts and group names, never alert documents), so this is generous.
 */
export const DETONATE_TOOL_MAX_RESULT_TOKENS = 4000;

export type DetonateToolErrorType =
  | 'insufficient_privileges'
  | 'service_unavailable'
  | 'not_found'
  | 'invalid_argument'
  | 'unknown_error';

/** Typed error result, matching the response-actions skill's error envelope. */
export const detonateErrorResult = (
  error: DetonateToolErrorType,
  message: string,
  extra?: Record<string, unknown>
) => ({
  results: [
    {
      tool_result_id: getToolResultId(),
      type: ToolResultType.error as const,
      data: {
        error,
        message,
        ...extra,
      },
    },
  ],
});

/**
 * Returned when the caller lacks the privilege the equivalent HTTP route
 * enforces. The skill reaches the detonation service through the in-process
 * client, which does NOT run the route's `requiredPrivileges` check — so each
 * tool asserts endpoint authz itself. Without this, a role with chat access
 * but no Security Solution privilege could spend VM time through the agent.
 */
export const insufficientPrivilegesResult = (privilege: string) =>
  detonateErrorResult(
    'insufficient_privileges',
    `Insufficient privileges: this action requires the '${privilege}' privilege. Ask an administrator to grant it, or detonate the sample from the Security UI.`,
    { privilege }
  );

/** Bounded view of one telemetry bucket's alert groups. */
const summarizeEndpointGroups = (
  groups: DetonateTask['production_endpoint_alert_groups']
): {
  groups: Array<{ event_code: string; alerts_count: number; rule_name?: string }>;
  truncated?: number;
} => {
  const sample = groups.slice(0, MAX_ALERT_GROUPS).map((group) => ({
    event_code: group.event_code,
    alerts_count: group.alerts_count,
    ...(group.rule_name ? { rule_name: group.rule_name } : {}),
  }));
  return {
    groups: sample,
    ...(groups.length > sample.length ? { truncated: groups.length - sample.length } : {}),
  };
};

const summarizeDetectionGroups = (
  groups: DetonateTask['production_detection_alert_groups']
): {
  groups: Array<{ rule_name: string; alerts_count: number; severity: string }>;
  truncated?: number;
} => {
  const sample = groups.slice(0, MAX_ALERT_GROUPS).map((group) => ({
    rule_name: group.kibana_alert_rule_name,
    alerts_count: group.alerts_count,
    severity: group.kibana_alert_rule_parameters_severity,
  }));
  return {
    groups: sample,
    ...(groups.length > sample.length ? { truncated: groups.length - sample.length } : {}),
  };
};

/**
 * Model-facing summary of a detonation task.
 *
 * Deliberately omits `alert_docs`: a detonation's alert documents are large
 * and carry sample content, and a chat answer never needs the raw documents to
 * say what the sample did. The task id is always present so the analyst can
 * open the run in the UI.
 */
export const summarizeDetonationTask = (task: DetonateTask) => {
  const complete = isDetonationComplete(task);
  const failed = isDetonationFailed(task);

  return {
    kind: 'detonation_task' as const,
    task_id: task.id,
    created_at: task.created_at,
    tags: task.tags,

    // State, in the three forms a caller actually branches on. `complete` and
    // `failed` are independent: a run can fail at any worker, and a completed
    // run is not necessarily a successful one.
    complete,
    failed,
    // Zero alerts on a completed run is a real result — a benign sample or a
    // detection gap — and the flag exists so the agent reports it as a finding
    // rather than as "something went wrong".
    quiet: detonationWasQuiet(task),
    progress: detonationProgress(task),
    last_worker_name: task.last_worker_name,
    last_worker_status: task.last_worker_status,
    ...(task.last_worker_status_details
      ? { last_worker_status_details: task.last_worker_status_details }
      : {}),

    // No `sample_hash` echo: the analyst already knows the hash they asked
    // about, task_id + filename identify the run, and a hash in a tool result
    // tends to be repeated verbatim in the chat answer.
    ...(task.sample_filename ? { sample_filename: task.sample_filename } : {}),
    ...(task.sample_source ? { sample_source: task.sample_source } : {}),

    ...(task.vm_os_family ? { vm_os_family: task.vm_os_family } : {}),
    ...(task.vm_architecture ? { vm_architecture: task.vm_architecture } : {}),
    ...(task.elastic_agent_id ? { elastic_agent_id: task.elastic_agent_id } : {}),

    total_alerts_count: totalDetonationAlerts(task),
    production_endpoint_alerts: {
      count: task.production_endpoint_alerts_count ?? 0,
      ...summarizeEndpointGroups(task.production_endpoint_alert_groups),
    },
    diagnostic_endpoint_alerts: {
      count: task.diagnostic_endpoint_alerts_count ?? 0,
      ...summarizeEndpointGroups(task.diagnostic_endpoint_alert_groups),
    },
    production_detection_alerts: {
      count: task.production_detection_alerts_count ?? 0,
      ...summarizeDetectionGroups(task.production_detection_alert_groups),
    },
  };
};

/**
 * Maps a thrown client error onto a typed tool result.
 *
 * `submitAttempted` marks whether the detonation may already be running: the
 * client sends the request before it reads the response, so a throw after
 * dispatch does not mean nothing happened, and telling the agent otherwise
 * invites a duplicate submission that spends a second VM.
 */
export const detonateServiceErrorResult = (
  error: unknown,
  operation: string,
  extra?: Record<string, unknown>
) => {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode === 404) {
    return detonateErrorResult('not_found', `Could not ${operation}: ${message}`, extra);
  }
  if (statusCode === 400) {
    return detonateErrorResult('invalid_argument', `Could not ${operation}: ${message}`, extra);
  }
  return detonateErrorResult(
    'service_unavailable',
    `Could not ${operation}: ${message}. The detonation service may be unreachable or not configured.`,
    extra
  );
};
