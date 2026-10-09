/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { z } from '@kbn/zod';
import type { Client as EsClient } from '@elastic/elasticsearch';
import {
  ExecutionStatus,
  TerminalExecutionStatuses,
  type ChildWorkflowExecutionItem,
  type WorkflowExecutionDto,
  type WorkflowStepExecutionDto,
} from '@kbn/workflows';
import {
  PROPOSALS_API_VERSION,
  PROPOSALS_INTERNAL_URL,
  type ListProposalsResponse,
  type Proposal,
} from '@kbn/proposals-common';
import {
  AGENT_BUILDER_API_VERSION,
  COVERAGE_REVIEW_WORKFLOW_ID,
  CREATE_INVESTIGATION_STEP_ID,
  DRAFT_STEP_ID,
  EVAL_SPACE_ID,
  RULE_CREATION_WORKFLOW_ID,
  RUN_RULE_CREATION_STEP_ID,
  WORKFLOWS_API_VERSION,
} from './constants';
import { draftRuleSchema, type DraftRule } from './types';
import { deleteEvalIndicators, seedCoverageIndicator } from './workflow_fixture';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The ai.agent step's persisted output is
// `{ message, structured_output: { rule, attachment_id, attachment_version, reason },
//    conversation_id, metadata: { usage } }` — the rule is NESTED under
// structured_output.rule (see the managed yaml templates:
// `steps.draft_creation.output.structured_output.rule.query`). Parsing structured_output
// as the rule itself strips the wrapper and yields an empty object — every evaluator
// then sees a rule with no fields (the false-zero failure this fixed).
const stepOutputSchema = z
  .object({
    structured_output: z
      .object({
        rule: draftRuleSchema,
        // The workflow has no `skipped` flag: when the agent produces no rule it returns
        // empty strings for name/description/query and says why under `reason`.
        reason: z.string(),
      })
      .partial(),
    metadata: z.object({ usage: z.object({ connectorId: z.string() }).partial() }).partial(),
  })
  .partial();

export interface DraftOutcome {
  rule: DraftRule | undefined;
  /** True when the agent declined to draft and said why (distinct from a failed draft). */
  skipped: boolean;
  /** The agent's one-sentence reason, when it declined. */
  skipReason: string | undefined;
  /** Connector the ai.agent step actually ran on, as reported by the step's usage metadata. */
  connectorId: string | undefined;
}

// Each step produces two entries in stepExecutions: an "enter" record (output: null)
// and a "result" record (output: data). Find the result record for draft_creation.
export const extractDraftFromSteps = (steps: WorkflowStepExecutionDto[]): DraftOutcome => {
  const resultRecord = steps.find((s) => s.stepId === DRAFT_STEP_ID && s.output != null);
  const parsed = stepOutputSchema.safeParse(resultRecord?.output);
  if (!parsed.success) {
    return { rule: undefined, skipped: false, skipReason: undefined, connectorId: undefined };
  }
  const out = parsed.data.structured_output;
  const connectorId = parsed.data.metadata?.usage?.connectorId;
  // The workflow's own `draft_ready` test: a draft with no query is not a rule. The
  // schema forces every rule field to be present, so "no rule" arrives as empty strings.
  const hasRule = Boolean(out?.rule?.query?.trim());
  const reason = out?.reason?.trim();
  return {
    rule: hasRule ? out?.rule : undefined,
    skipped: !hasRule && Boolean(reason),
    skipReason: reason || undefined,
    connectorId,
  };
};

export interface RuleCreationResult extends DraftOutcome {
  /** True when the run parked on a pending proposal awaiting the analyst. */
  pendingApproval: boolean;
  /** The pending proposal, when the run reached the gate. */
  proposalId: string | undefined;
  /** Investigation (conversation) the proposal is recorded on; opened by coverage_review. */
  investigationId: string;
  traceId: string | undefined;
  /** The rule_creation execution (the child coverage_review started via `run_rule_creation`). */
  workflowExecutionId: string;
  /** The coverage Worker run that swept the seeded indicator. */
  workerExecutionId: string;
  /** The coverage_review execution between the two. */
  reviewExecutionId: string;
  /** Identity rule_creation recorded; inherited from the Worker, never bound on rule_creation. */
  effectiveIdentity: WorkflowExecutionDto['effectiveIdentity'];
  status: ExecutionStatus;
  stepExecutions: WorkflowStepExecutionDto[];
}

export interface RuleCreationInput {
  technique: string;
  gap_description: string;
  evidence: string;
  confidence: number;
}

/** Where a run starts: the enabled coverage Worker's per-space workflow, and the ES to seed. */
export interface CoverageTrigger {
  /** `workflowId` from `bindCoverageWorker`. */
  workerWorkflowId: string;
  esClient: EsClient;
}

const isTerminal = (status: ExecutionStatus): boolean => TerminalExecutionStatuses.includes(status);

export class RuleCreationClient {
  private readonly pendingExecutionIds: string[] = [];
  private readonly investigationIds: string[] = [];
  private seededWith: EsClient | undefined;
  /**
   * The sweep runs one at a time per space (`concurrency: drop`) and starts reviews for every
   * pending indicator, so concurrent run() calls would have their sweeps dropped. Serialize.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private trigger: CoverageTrigger | undefined;

  constructor(private readonly fetch: HttpHandler, private readonly log: ToolingLog) {}

  /** Set once per worker after `bindCoverageWorker`; every run() starts from this Worker. */
  useCoverageTrigger(trigger: CoverageTrigger): void {
    this.trigger = trigger;
  }

  private async getExecution(workflowExecutionId: string): Promise<WorkflowExecutionDto> {
    return this.fetch<WorkflowExecutionDto>(`/api/workflows/executions/${workflowExecutionId}`, {
      method: 'GET',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      query: { includeOutput: true },
    });
  }

  private async findPendingProposal(investigationId: string): Promise<Proposal | undefined> {
    const { proposals } = await this.fetch<ListProposalsResponse>(PROPOSALS_INTERNAL_URL, {
      method: 'GET',
      version: PROPOSALS_API_VERSION,
      headers: { 'elastic-api-version': PROPOSALS_API_VERSION },
      query: { conversationId: investigationId, status: 'pending', size: 1 },
    });
    return proposals[0];
  }

  /** Finds the review coverage_worker started for one indicator by its concurrency key. */
  private async findReviewExecutionId(kiId: string): Promise<string | undefined> {
    const { results } = await this.fetch<{ results: Array<{ id: string }> }>(
      `/api/workflows/workflow/${COVERAGE_REVIEW_WORKFLOW_ID}/executions`,
      {
        method: 'GET',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
        query: { concurrencyGroupKey: `coverage-${kiId}` },
      }
    );
    return results?.[0]?.id;
  }

  /** The rule_creation child coverage_review starts at `run_rule_creation` (sync, one level). */
  private async findRuleCreationExecutionId(reviewExecutionId: string): Promise<string | undefined> {
    const children = await this.fetch<ChildWorkflowExecutionItem[]>(
      `/api/workflows/executions/${encodeURIComponent(reviewExecutionId)}/children`,
      {
        method: 'GET',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      }
    );
    return (Array.isArray(children) ? children : []).find(
      (child) => child.workflowId === RULE_CREATION_WORKFLOW_ID
    )?.executionId;
  }

  /**
   * Triggers rule_creation the way production does and waits until it either finishes or parks
   * on the analyst's decision:
   *
   *   seed a pending `security.coverage` indicator
   *   -> run the coverage Worker (bound to its service account by `bindCoverageWorker`)
   *   -> its sweep starts coverage_review for the indicator (inherit)
   *   -> coverage_review's `no_coverage` branch runs rule_creation (inherit)
   *
   * `propose_creation` and `preview_creation` park the rule_creation run in WAITING_FOR_CHILD,
   * so that status alone does not mean the gate was reached: the run is only at the gate once a
   * pending proposal exists on the investigation coverage_review opened.
   */
  run(params: {
    input: RuleCreationInput;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }): Promise<RuleCreationResult> {
    const { trigger } = this;
    if (!trigger) {
      return Promise.reject(
        new Error('RuleCreationClient.useCoverageTrigger() must be called before run()')
      );
    }
    const result = this.queue.then(() => this.runSerialized({ ...params, trigger }));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async runSerialized({
    input,
    trigger,
    maxWaitMs = 10 * 60_000,
    pollIntervalMs = 5_000,
  }: {
    input: RuleCreationInput;
    trigger: CoverageTrigger;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }): Promise<RuleCreationResult> {
    const deadline = Date.now() + maxWaitMs;
    const kiId = `rule-creation-eval-${uuidv4()}`;
    this.seededWith = trigger.esClient;
    await seedCoverageIndicator({
      esClient: trigger.esClient,
      id: kiId,
      technique: input.technique,
      gapDescription: input.gap_description,
      evidence: input.evidence,
      spaceId: EVAL_SPACE_ID,
    });

    const { workflowExecutionId: workerExecutionId } = await this.fetch<{
      workflowExecutionId: string;
    }>(`/api/workflows/workflow/${trigger.workerWorkflowId}/run`, {
      method: 'POST',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      body: JSON.stringify({ inputs: {} }),
    });
    this.pendingExecutionIds.push(workerExecutionId);
    this.log.info(`Started coverage Worker run ${workerExecutionId} for indicator ${kiId}`);

    let reviewExecutionId: string | undefined;
    let workerExecution: WorkflowExecutionDto | undefined;
    while (Date.now() < deadline && !reviewExecutionId) {
      reviewExecutionId = await this.findReviewExecutionId(kiId);
      if (reviewExecutionId) break;
      workerExecution = await this.getExecution(workerExecutionId);
      if (isTerminal(workerExecution.status)) {
        // The sweep ends before the review is visible only when it started none.
        reviewExecutionId = await this.findReviewExecutionId(kiId);
        if (!reviewExecutionId) {
          throw new Error(
            `Coverage Worker run ${workerExecutionId} ended ${workerExecution.status} without ` +
              `starting a review for indicator ${kiId}. Sweep steps: ` +
              JSON.stringify(
                (workerExecution.stepExecutions ?? []).map((s) => ({
                  step: s.stepId,
                  status: s.status,
                  error: s.error,
                }))
              )
          );
        }
        break;
      }
      await sleep(pollIntervalMs);
    }
    if (!reviewExecutionId) {
      throw new Error(`No coverage review for indicator ${kiId} within ${maxWaitMs}ms`);
    }
    this.pendingExecutionIds.push(reviewExecutionId);
    this.log.info(`Coverage review ${reviewExecutionId} started for indicator ${kiId}`);

    let ruleCreationId: string | undefined;
    let review: WorkflowExecutionDto | undefined;
    while (Date.now() < deadline && !ruleCreationId) {
      ruleCreationId = await this.findRuleCreationExecutionId(reviewExecutionId);
      if (ruleCreationId) break;
      review = await this.getExecution(reviewExecutionId);
      if (isTerminal(review.status)) {
        throw new Error(
          `Coverage review ${reviewExecutionId} ended ${review.status} without running ` +
            `${RUN_RULE_CREATION_STEP_ID} (the coverage check did not return no_coverage). ` +
            `Steps: ${(review.stepExecutions ?? []).map((s) => `${s.stepId}:${s.status}`).join(', ')}`
        );
      }
      await sleep(pollIntervalMs);
    }
    if (!ruleCreationId) {
      throw new Error(
        `Coverage review ${reviewExecutionId} did not start rule_creation within ${maxWaitMs}ms`
      );
    }
    this.pendingExecutionIds.push(ruleCreationId);

    review = await this.getExecution(reviewExecutionId);
    const investigationId = (
      review.stepExecutions?.find((s) => s.stepId === CREATE_INVESTIGATION_STEP_ID)?.output as
        | { conversation_id?: string }
        | undefined
    )?.conversation_id;
    if (!investigationId) {
      throw new Error(
        `Coverage review ${reviewExecutionId} recorded no investigation (${CREATE_INVESTIGATION_STEP_ID})`
      );
    }
    this.investigationIds.push(investigationId);
    this.log.info(
      `Rule-creation execution ${ruleCreationId} (child of review ${reviewExecutionId}) on investigation ${investigationId}`
    );

    let execution: WorkflowExecutionDto | undefined;
    let proposal: Proposal | undefined;
    while (Date.now() < deadline) {
      execution = await this.getExecution(ruleCreationId);
      if (isTerminal(execution.status)) break;
      if (execution.status === ExecutionStatus.WAITING_FOR_CHILD) {
        proposal = await this.findPendingProposal(investigationId);
        if (proposal) break;
      }
      await sleep(pollIntervalMs);
    }
    if (!execution) {
      throw new Error(`No execution state returned while polling ${ruleCreationId}`);
    }

    if (!proposal && !isTerminal(execution.status)) {
      this.log.warning(
        `Workflow ${ruleCreationId} neither finished nor reached the proposal gate within ${maxWaitMs}ms (last status: ${execution.status})`
      );
    }

    const draft = extractDraftFromSteps(execution.stepExecutions ?? []);

    if (draft.skipped) {
      this.log.info(`Workflow ${ruleCreationId}: draft_creation returned no rule (${draft.skipReason})`);
    } else if (!draft.rule) {
      this.log.warning(
        `Workflow ${ruleCreationId} reached ${execution.status} but draft_creation produced no rule and gave no reason — evaluators will score N/A`
      );
    }

    return {
      ...draft,
      pendingApproval: proposal !== undefined,
      proposalId: proposal?.id,
      investigationId,
      traceId: execution.traceId,
      workflowExecutionId: ruleCreationId,
      workerExecutionId,
      reviewExecutionId,
      effectiveIdentity: execution.effectiveIdentity,
      status: execution.status,
      stepExecutions: execution.stepExecutions ?? [],
    };
  }

  /**
   * Decides the pending proposal the way an analyst does — through the proposals API — then
   * polls until the rule-creation run reaches a terminal state. Call after run() returned
   * pendingApproval:true.
   */
  async respond({
    workflowExecutionId,
    proposalId,
    approved,
    maxWaitMs = 5 * 60_000,
    pollIntervalMs = 5_000,
  }: {
    workflowExecutionId: string;
    proposalId: string | undefined;
    approved: boolean;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }): Promise<WorkflowExecutionDto> {
    if (!proposalId) {
      throw new Error(`No pending proposal to decide for execution ${workflowExecutionId}`);
    }

    const action = approved ? 'approve' : 'dismiss';
    this.log.info(`Sending ${action} for proposal ${proposalId}`);
    await this.fetch(`${PROPOSALS_INTERNAL_URL}/${encodeURIComponent(proposalId)}/${action}`, {
      method: 'POST',
      version: PROPOSALS_API_VERSION,
      headers: { 'elastic-api-version': PROPOSALS_API_VERSION },
      body: JSON.stringify(approved ? {} : { dismissReason: 'no_reason' }),
    });

    const deadline = Date.now() + maxWaitMs;
    let execution = await this.getExecution(workflowExecutionId);
    while (!isTerminal(execution.status) && Date.now() < deadline) {
      await sleep(pollIntervalMs);
      execution = await this.getExecution(workflowExecutionId);
    }
    return execution;
  }

  /** Reads the proposal back; the approve/dismiss routes do not return the settled record. */
  async getProposal(proposalId: string): Promise<Proposal> {
    return this.fetch<Proposal>(`${PROPOSALS_INTERNAL_URL}/${encodeURIComponent(proposalId)}`, {
      method: 'GET',
      version: PROPOSALS_API_VERSION,
      headers: { 'elastic-api-version': PROPOSALS_API_VERSION },
    });
  }

  /**
   * Cancels every run this client started (a review parked on its proposal holds the gate open
   * for up to 72h), deletes the investigations coverage_review opened, and removes the
   * indicators this suite seeded so the next sweep cannot pick them up again.
   */
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

    await Promise.allSettled(
      this.investigationIds.map((id) =>
        this.fetch(`/api/agent_builder/conversations/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          version: AGENT_BUILDER_API_VERSION,
          headers: { 'elastic-api-version': AGENT_BUILDER_API_VERSION },
        })
      )
    );
    this.investigationIds.length = 0;

    if (this.seededWith) {
      await deleteEvalIndicators(this.seededWith).catch((error: Error) =>
        this.log.warning(`Could not delete seeded coverage indicators: ${error.message}`)
      );
    }
  }
}
