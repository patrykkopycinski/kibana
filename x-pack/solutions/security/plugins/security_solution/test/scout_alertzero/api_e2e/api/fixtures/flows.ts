/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout-security';
import type { ListProposalsResponse } from '@kbn/proposals-common';
import {
  AI_INDEX_KI_BACKING_INDEX,
  AI_INDEX_URL,
  CONVERSATIONS_URL,
  PROPOSAL_TIMEOUT_MS,
  PROPOSALS_URL,
  SECURITY_INVESTIGATIONS_AI_INDEX_ID,
} from '../../common/constants';
import { ok, pollUntil } from '../../common/kbn';
import type { AlertZeroApi } from '../../common/kbn';
import type { ExecutionStep, WorkflowExecution } from './alertzero';
import { describeExecution, waitForExecution, waitForExecutionStatus } from './alertzero';

export interface PendingProposal {
  readonly id: string;
  readonly conversationId: string;
  readonly title: string;
  readonly comment: string;
  readonly actionWorkflowId?: string;
  readonly actionInput?: Record<string, unknown>;
  readonly workflowExecutionId?: string;
  readonly createdAt: string;
}

export const listPendingProposals = async (api: AlertZeroApi): Promise<PendingProposal[]> =>
  ok(
    await api.internal<ListProposalsResponse>('GET', PROPOSALS_URL, {
      query: { origin: 'alertzero', status: 'pending', excludeSuperseded: true, size: 100 },
    }),
    'list pending proposals'
  ).proposals as PendingProposal[];

/**
 * Waits for a pending proposal whose action workflow matches and that was created after `since`.
 * `since` keeps a re-run from grabbing a proposal left behind by an earlier failed run.
 */
export const waitForProposal = async (
  api: AlertZeroApi,
  actionWorkflowId: string,
  since: string,
  { timeoutMs }: { timeoutMs: number }
): Promise<PendingProposal> =>
  pollUntil(
    `a pending ${actionWorkflowId} proposal`,
    async () =>
      (await listPendingProposals(api)).find(
        (proposal) => proposal.actionWorkflowId === actionWorkflowId && proposal.createdAt >= since
      ),
    { timeoutMs }
  );

/**
 * Approves a proposal exactly as the approval modal does, but only once the execution backing it
 * has parked in `waiting_for_input`. The route answers 409 earlier; retrying the 409 blindly would
 * green the test without the run actually waiting for the human.
 */
export const approveProposal = async (
  api: AlertZeroApi,
  proposal: PendingProposal,
  actionInput?: Record<string, unknown>
): Promise<void> => {
  if (proposal.workflowExecutionId) {
    await waitForExecutionStatus(
      api,
      `the execution behind proposal ${proposal.id} to wait for input`,
      proposal.workflowExecutionId,
      'waiting_for_input',
      { timeoutMs: PROPOSAL_TIMEOUT_MS }
    );
  }
  ok(
    await api.internal('POST', `${PROPOSALS_URL}/${encodeURIComponent(proposal.id)}/approve`, {
      body: { actionInput: actionInput ?? proposal.actionInput },
    }),
    `approve proposal ${proposal.id}`
  );
};

/** Dismisses a proposal, e.g. to settle a review gate without running its action. */
export const dismissProposal = async (
  api: AlertZeroApi,
  proposal: PendingProposal
): Promise<void> => {
  ok(
    await api.internal('POST', `${PROPOSALS_URL}/${encodeURIComponent(proposal.id)}/dismiss`, {
      body: { dismissReason: 'no_reason' },
    }),
    `dismiss proposal ${proposal.id}`
  );
};

/** Starts a workflow through the public run route; the caller runs as the admin user. */
export const runWorkflow = async (
  api: AlertZeroApi,
  workflowId: string,
  inputs: Record<string, unknown>,
  { timeoutMs }: { timeoutMs: number }
): Promise<WorkflowExecution> => {
  const executionId = ok(
    await api.public<{ workflowExecutionId: string }>(
      'POST',
      `/api/workflows/workflow/${encodeURIComponent(workflowId)}/run`,
      { body: { inputs } }
    ),
    `run workflow ${workflowId}`
  ).workflowExecutionId;
  return waitForExecution(api, `workflow ${workflowId} execution`, executionId, { timeoutMs });
};

/**
 * Creates the Investigation conversation the forensics / coverage flows attach to. The template
 * id is what the AlertZero workflows themselves pass to `ai.conversation.create`; the metadata
 * shape is their `status: open` contract.
 */
export const createInvestigation = async (
  api: AlertZeroApi,
  title: string,
  description: string
): Promise<string> =>
  ok(
    await api.public<{ id: string }>('POST', CONVERSATIONS_URL, {
      body: {
        title,
        access_control: { access_mode: 'public' },
        template_id: 'investigation',
        metadata: { status: 'open', description, workflow_execution_ids: [] },
      },
    }),
    `create investigation ${title}`
  ).id;

export interface ConversationAttachment {
  readonly id?: string;
  readonly type?: string;
  [field: string]: unknown;
}

export const listAttachments = async (
  api: AlertZeroApi,
  conversationId: string
): Promise<ConversationAttachment[]> =>
  ok(
    await api.public<{ results: ConversationAttachment[] }>(
      'GET',
      `${CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}/attachments`
    ),
    `list attachments of ${conversationId}`
  ).results;

export interface KnowledgeIndicatorSeed {
  readonly kiId: string;
  readonly type: string;
  readonly title: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly attributes: Record<string, string | number | boolean>;
}

/**
 * Writes a knowledge indicator straight into the managed `security-investigations` backing index,
 * the same document shape `context-engine.createKi` produces. The producer fields mirror the
 * AlertZero writers so sweeps selecting on `attributes.status` / `attributes.space_id` find it.
 */
export const seedKnowledgeIndicator = async (
  esClient: EsClient,
  seed: KnowledgeIndicatorSeed
): Promise<string> => {
  const now = new Date().toISOString();
  await esClient.index({
    index: AI_INDEX_KI_BACKING_INDEX,
    id: seed.kiId,
    refresh: 'wait_for',
    document: {
      '@timestamp': now,
      updated_at: now,
      id: seed.kiId,
      type: seed.type,
      title: seed.title,
      ...(seed.description ? { description: seed.description } : {}),
      tags: ['consumer:detection', 'status:pending', 'watch:test', ...(seed.tags ?? [])],
      attributes: {
        status: 'pending',
        producer: 'alertzero-e2e.seed.v1',
        watch_id: 'test',
        space_id: 'default',
        ...seed.attributes,
      },
    },
  });
  return seed.kiId;
};

/** Removes exactly the indicators this run wrote, identified by their stable id prefix. */
export const cleanupKnowledgeIndicators = async (
  esClient: EsClient,
  kiIds: readonly string[]
): Promise<void> => {
  if (kiIds.length === 0) {
    return;
  }
  await esClient
    .deleteByQuery({
      index: AI_INDEX_KI_BACKING_INDEX,
      conflicts: 'proceed',
      refresh: true,
      query: { ids: { values: [...kiIds] } },
    })
    .catch((error: { statusCode?: number }) => {
      if (error.statusCode !== 404) {
        throw error;
      }
    });
};

export const readKnowledgeIndicator = async (
  esClient: EsClient,
  kiId: string
): Promise<{ found: boolean; status?: string }> => {
  try {
    const hit = await esClient.get({ index: AI_INDEX_KI_BACKING_INDEX, id: kiId });
    const source = hit._source as { attributes?: { status?: string } } | undefined;
    return { found: true, status: source?.attributes?.status };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return { found: false };
    }
    throw error;
  }
};

export { SECURITY_INVESTIGATIONS_AI_INDEX_ID };

/**
 * Registers the `security-investigations` AI index record if the stack has none yet. Producers
 * get it lazily from `context-engine.createKi`; seeding straight into the backing index skips
 * that, and a sweep's `context-engine.updateKi` then fails with "AI index not found" before it
 * dispatches anything. Idempotent: an existing record answers 409.
 */
export const ensureInvestigationsAiIndex = async (api: AlertZeroApi): Promise<void> => {
  const result = await api.public('POST', AI_INDEX_URL, {
    body: {
      id: SECURITY_INVESTIGATIONS_AI_INDEX_ID,
      dest: { type: 'index', value: AI_INDEX_KI_BACKING_INDEX },
      automations: [],
      sources: [],
      traces: [],
    },
  });
  if (result.statusCode !== 409) {
    ok(result, 'register the security-investigations AI index');
  }
};

/**
 * Re-throws a failed wait with what the stack was actually holding: every pending proposal's
 * action and title, plus the per-step breakdown of the execution that should have raised it. A
 * proposal that never matches then names the one that did arrive instead of just timing out.
 */
export const explainMissingProposal = async (
  api: AlertZeroApi,
  error: unknown,
  executionId: string
): Promise<never> => {
  const pending = await listPendingProposals(api).catch(() => [] as PendingProposal[]);
  const held = pending
    .map((proposal) => `  ${proposal.actionWorkflowId ?? 'no action'}: ${proposal.title}`)
    .join('\n');
  // Step-level state first and compact: failure reporters truncate the message, and the steps
  // (own and children's) that did not complete say whether the model step, a child run or a
  // gate stalled.
  const unfinished = (steps: ExecutionStep[] | undefined, prefix: string) =>
    (steps ?? [])
      .filter((step) => step.status !== 'completed' && step.status !== 'skipped')
      .map((step) => `${prefix}${step.stepId}=${step.status}`);
  const stalled = await Promise.all([
    api
      .public<WorkflowExecution>('GET', `/api/workflows/executions/${executionId}`)
      .then((response) => unfinished(ok(response, 'read the execution').stepExecutions, '')),
    api
      .public<Array<{ workflowId: string; stepExecutions: ExecutionStep[] }>>(
        'GET',
        `/api/workflows/executions/${executionId}/children`
      )
      .then((response) =>
        ok(response, 'read the child executions').flatMap((child) =>
          unfinished(child.stepExecutions, `${child.workflowId}:`)
        )
      ),
  ])
    .then((groups) => groups.flat().join(','))
    .catch(() => 'unreadable');
  throw new Error(
    `${(error as Error).message}\n[stalled steps: ${stalled || 'none'}]\npending proposals:\n${
      held || '  none'
    }\n${await describeExecution(api, executionId)}`
  );
};
