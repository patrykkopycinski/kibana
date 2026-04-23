/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Raw shape of an Argus skill JSON (soc-simulation/skills/*.json). The
 * manifest only reads `id`, `name`, `description`, `tool_ids` — the `content`
 * field (system prompt) is NEVER projected to external callers.
 */
export interface ArgusSkillDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * The skill's system prompt. Held in memory for the in-process dispatcher
   * but never surfaced to MCP / A2A clients.
   */
  readonly content: string;
  readonly tool_ids: readonly string[];
}

/**
 * Profiles are negotiated at authentication time. They are ADDITIVE: operator
 * sees everything read-only sees plus the write surface.
 */
export type PrincipalProfile = 'read-only' | 'advisory' | 'operator';

/**
 * The protocol the caller is talking to the server over. Used to namespace
 * `actor_id` (`mcp:*` vs `a2a:*`) so the trust-tier assessor can track
 * their tiers independently.
 */
export type Protocol = 'mcp' | 'a2a';

export interface Principal {
  readonly protocol: Protocol;
  /**
   * Stable client / peer identifier. Derived from the caller's credentials,
   * NOT from user-controlled payload fields.
   */
  readonly client_id: string;
  readonly profile: PrincipalProfile;
}

/**
 * Governance preconditions queried from Elasticsearch before the server is
 * willing to expose anything wider than the `read-only` subset. Provided by
 * the host process; the manifest module is pure.
 */
export interface GovernanceSnapshot {
  readonly adversarial_gate: 'pass' | 'marginal' | 'fail' | 'unknown';
  readonly adversarial_min_no_secret_leakage: number;
  readonly reasoning_gate: 'pass' | 'marginal' | 'fail' | 'unknown';
  readonly watchdog_frozen: boolean;
}

/**
 * Derived hints about what a tool does, computed from the skill's tool_ids.
 * These mirror the MCP 2025 spec's ToolAnnotations fields.
 */
export interface ArgusToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

/**
 * MCP tool descriptor — structured, transport-free. The MCP server serializes
 * this straight into its tools/list response. `inputSchema` and `outputSchema`
 * are JSON Schema fragments (not zod) so the SDK can ship them over the wire
 * without a zod→json conversion step.
 */
export interface McpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly annotations: ArgusToolAnnotations;
  readonly _meta: {
    readonly skill_id: string;
    readonly owning_actor: string;
  };
}

/**
 * A single A2A capability entry. The server wraps these in a full agent
 * card at GET /.well-known/agent.json.
 */
export interface A2aSkillCapability {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
  readonly output_schema: Record<string, unknown>;
  readonly annotations: ArgusToolAnnotations;
}

/**
 * Projection of the skill catalog for a single principal. The server calls
 * `projectManifestFor` on every list_tools / agent-card request — the result
 * is cheap to recompute and depends on the current governance snapshot, so
 * caching it across calls would be wrong.
 */
export interface ProjectedManifest {
  readonly principal: Principal;
  readonly mcp_tools: readonly McpToolDescriptor[];
  readonly a2a_skills: readonly A2aSkillCapability[];
  /**
   * Populated when preconditions (adversarial gate, reasoning gate, watchdog)
   * force the principal down to `read-only` regardless of their negotiated
   * profile. Surfaced to the caller as `_meta.server_governance_hold` so
   * operators can see WHY their surface shrank.
   */
  readonly governance_hold?: string;
}
