/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { ProposalProperties } from '../../client/proposals/types';
import type { ActionResultProperties, ActionResultStatus } from '../../client/action_results/storage';
import { DAYBREAK_ACTION_RESULT_SCHEMA_VERSION } from './versions';

export interface BuildActionResultParams {
  proposal: ProposalProperties;
  action: string;
  hostName: string;
  toolResult: unknown;
  actor?: string;
  investigationId?: string;
  workflowExecutionId?: string;
  now?: Date;
}

const summarizeToolResult = (toolResult: unknown): string => {
  if (!toolResult || typeof toolResult !== 'object') {
    return 'Response action completed.';
  }

  const results = (toolResult as { results?: Array<{ data?: Record<string, unknown> }> }).results;
  const first = results?.[0]?.data;
  if (!first) {
    return 'Response action completed.';
  }

  if (typeof first.message === 'string') {
    return first.message;
  }

  if (first.found === false) {
    return typeof first.message === 'string'
      ? first.message
      : 'No endpoint found for the requested host.';
  }

  const action = typeof first.action === 'string' ? first.action : 'response-action';
  const hostName = typeof first.hostName === 'string' ? first.hostName : 'host';
  const status = typeof first.status === 'string' ? first.status : 'completed';
  return `${action} on ${hostName}: ${status}`;
};

const deriveStatus = (toolResult: unknown): ActionResultStatus => {
  if (!toolResult || typeof toolResult !== 'object') {
    return 'completed';
  }

  if ((toolResult as { stub?: boolean }).stub === true) {
    return 'stubbed';
  }

  const results = (toolResult as { results?: Array<{ data?: Record<string, unknown> }> }).results;
  const first = results?.[0]?.data;
  if (first?.found === false) {
    return 'failed';
  }

  if (first?.status === 'partial') {
    return 'partial';
  }

  return 'completed';
};

/** Build a persisted Action Result from a response-action tool invocation. */
export const buildActionResultFromResponse = (
  params: BuildActionResultParams
): ActionResultProperties => {
  const {
    proposal,
    action,
    hostName,
    toolResult,
    actor = 'daybreak-operator',
    investigationId,
    workflowExecutionId,
    now = new Date(),
  } = params;

  const status = deriveStatus(toolResult);
  const approvedBy = proposal.approvals[proposal.approvals.length - 1]?.actor;

  return {
    schemaVersion: DAYBREAK_ACTION_RESULT_SCHEMA_VERSION,
    id: randomUUID(),
    actionType: action,
    target: hostName,
    approvedBy,
    executedBy: actor,
    executedAt: now.toISOString(),
    status,
    outputSummary: summarizeToolResult(toolResult),
    toolResult:
      toolResult && typeof toolResult === 'object'
        ? (toolResult as Record<string, unknown>)
        : undefined,
    proposalId: proposal.id,
    sourceWorkerId: proposal.sourceWorkerId,
    investigationId,
    workflowExecutionId,
    ...(status === 'stubbed' ? { stub: true } : {}),
  };
};
