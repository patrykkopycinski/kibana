/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusSkillDescriptor, GovernanceSnapshot, Principal } from '@kbn/argus-tool-manifest';

/**
 * Mirrors A2A v0.2's TaskState enum. We implement the terminal subset now;
 * `working` will start being emitted separately from `submitted` when we add
 * `tasks/sendSubscribe` (SSE) in v2.
 */
export type A2aTaskState =
  | 'submitted'
  | 'working'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'input-required';

export interface A2aMessagePart {
  readonly type: 'text' | 'data';
  readonly text?: string;
  readonly data?: Record<string, unknown>;
}

export interface A2aMessage {
  readonly role: 'user' | 'agent';
  readonly parts: readonly A2aMessagePart[];
}

export interface A2aArtifact {
  readonly name: string;
  readonly description?: string;
  readonly parts: readonly A2aMessagePart[];
  readonly metadata?: Record<string, unknown>;
}

export interface A2aTaskError {
  readonly code: 'unknown_skill' | 'invalid_input' | 'governance_hold' | 'dispatch_failed';
  readonly message: string;
}

export interface A2aTask {
  readonly id: string;
  readonly session_id?: string;
  readonly status: {
    readonly state: A2aTaskState;
    readonly timestamp: number;
    readonly message?: A2aMessage;
    readonly error?: A2aTaskError;
  };
  readonly skill_id: string;
  readonly principal_actor_id: string;
  readonly artifacts: readonly A2aArtifact[];
  readonly history: readonly A2aMessage[];
  readonly metadata: {
    readonly propose_only: boolean;
    readonly correlation_id: string;
    readonly server_governance_hold?: string;
  };
}

/**
 * Loose input shape; the core validates it before building a DispatchRequest.
 */
export interface SendTaskInput {
  readonly skill_id: string;
  readonly task: string;
  readonly scope?: {
    readonly tenant_id?: string;
    readonly space_id?: string;
    readonly entity_ids?: readonly string[];
    readonly time_window?: string;
  };
  readonly propose_only?: boolean;
  readonly session_id?: string;
  readonly correlation_id?: string;
}

// ---------- dispatcher / governance contracts ----------

export interface MutationIntentSummary {
  readonly action_type: string;
  readonly door_class: 'one_way' | 'two_way';
  readonly blast_tier: 'small' | 'medium' | 'large' | 'critical';
  readonly recommendation_id: string;
}

export interface DispatchRequest {
  readonly principal: Principal;
  readonly skill: ArgusSkillDescriptor;
  readonly task: string;
  readonly scope: SendTaskInput['scope'];
  readonly propose_only: boolean;
  readonly correlation_id: string;
}

export interface DispatchResult {
  readonly skill_id: string;
  readonly summary: string;
  readonly structured_output: Record<string, unknown>;
  readonly trace: {
    readonly reasoning_trace_id: string;
    readonly gen_ai_operation: string;
  };
  readonly mutation_intents: readonly MutationIntentSummary[];
}

export interface SkillDispatcher {
  dispatch(req: DispatchRequest): Promise<DispatchResult>;
}

export interface GovernanceClient {
  snapshot(principal: Principal): Promise<GovernanceSnapshot>;
}
