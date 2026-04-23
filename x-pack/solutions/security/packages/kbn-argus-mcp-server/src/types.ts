/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusSkillDescriptor, GovernanceSnapshot, Principal } from '@kbn/argus-tool-manifest';

/**
 * Single call to an ARGUS skill, normalized from an MCP tools/call payload
 * (or an A2A tasks/send payload). The MCP server layer does the
 * namespace-stripping (argus.skill.<id> → <id>) before passing to the
 * dispatcher so the dispatcher itself is protocol-agnostic.
 */
export interface DispatchRequest {
  readonly principal: Principal;
  readonly skill: ArgusSkillDescriptor;
  /** Free-text task provided by the caller. Treated as untrusted. */
  readonly task: string;
  readonly scope: {
    readonly tenant_id?: string;
    readonly space_id?: string;
    readonly entity_ids?: readonly string[];
    readonly time_window?: string;
  };
  /**
   * When true, any mutation_intent emitted by the skill is forced to
   * `status: 'pending_review'` regardless of the principal's profile.
   * The server sets this server-side when the principal profile is
   * 'advisory'; the caller's payload cannot turn it off.
   */
  readonly propose_only: boolean;
  /** Threaded end-to-end across reasoning trace, recommendation, response. */
  readonly correlation_id: string;
}

export interface MutationIntentSummary {
  readonly intent_id: string;
  readonly door_class: 'one_way' | 'two_way';
  readonly blast_tier: 'small' | 'medium' | 'large' | 'critical';
  readonly status: 'proposed' | 'auto_apply_ready' | 'pending_review' | 'applied' | 'rejected';
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

/**
 * Fetches the live governance snapshot that the manifest projection uses
 * to decide a principal's effective profile. Pluggable so the core can be
 * unit-tested without Elasticsearch.
 */
export interface GovernanceClient {
  snapshot(principal: Principal): Promise<GovernanceSnapshot>;
}

/**
 * Executes a single skill call end-to-end (reasoning trace, mutation_intent,
 * fetching resolved intent status from the trust gate). Pluggable so the
 * MCP server core can be unit-tested without a running Kibana.
 */
export interface SkillDispatcher {
  dispatch(request: DispatchRequest): Promise<DispatchResult>;
}
