/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type ReasoningStepType =
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'decision'
  | 'recommendation';

export interface InjectionSurfaceFlag {
  readonly code: string;
  readonly severity: 'info' | 'warn' | 'error';
  readonly reason: string;
}

export interface ReasoningStep {
  readonly run_id: string;
  readonly step_index: number;
  readonly step_type: ReasoningStepType;
  readonly timestamp: string;
  readonly actor_id: string;
  readonly actor_trust_tier_at_decision?: TrustTier;
  readonly confidence?: number;
  readonly confidence_delta?: number;
  readonly injection_surface_flags?: readonly InjectionSurfaceFlag[];
  readonly title: string;
  readonly body?: string;
  readonly tool_name?: string;
  readonly tool_args_ref?: string;
  readonly tool_result_ref?: string;
  readonly source_doc_id?: string;
}

export type TrustTier = 'frontier' | 'trusted' | 'probationary' | 'quarantined' | 'system';

export interface ReasoningChainSubject {
  readonly kind: 'alert' | 'run';
  readonly id: string;
}

export interface ReasoningChain {
  readonly subject: ReasoningChainSubject;
  readonly run_id: string;
  readonly steps: readonly ReasoningStep[];
  readonly started_at: string;
  readonly finished_at?: string;
  readonly final_status: 'success' | 'failure' | 'aborted' | 'in_progress';
}

export type ReasoningChainReasonCode = 'ok' | 'no_trace' | 'not_authorized' | 'not_found';

export interface ReasoningChainBuildResult {
  readonly subject: ReasoningChainSubject;
  readonly reason_code: ReasoningChainReasonCode;
  readonly chain?: ReasoningChain;
}
