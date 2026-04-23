/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The two human-in-the-loop verdicts the console can write. Both land as a
 * `status` transition on the backing recommendation document plus an audit
 * trail entry. The server route rejects any other verdict value.
 *
 * These map to the `approved_by_human` / `rejected_by_human` statuses in
 * `soc-simulation/schemas/recommendation.schema.json` — not to the internal
 * `auto_apply_ready` / `rejected_backtest` transitions, which belong to the
 * machine-driven backtester workflow.
 */
export type ArgusMutationVerdictAction = 'approve' | 'reject';

export interface ArgusMutationVerdictRequest {
  readonly mutation_intent_id: string;
  readonly action: ArgusMutationVerdictAction;
  /**
   * Required when `action === 'reject'`; optional (but encouraged) for
   * approvals. Surfaces in the audit trail and on the Mutations row after
   * the panel refreshes.
   */
  readonly reason?: string;
}

export interface ArgusMutationVerdictResponse {
  readonly mutation_intent_id: string;
  readonly action: ArgusMutationVerdictAction;
  readonly previous_status?: string;
  readonly new_status: string;
  readonly audit_id: string;
  readonly reason?: string;
}
