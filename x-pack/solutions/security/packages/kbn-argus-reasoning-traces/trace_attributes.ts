/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * ARGUS M2.5 — Reasoning-trace governance attribute contract.
 *
 * Every span emitted by an ARGUS agent MUST set these attributes so the
 * governance layer can correlate reasoning steps back to the decision they
 * produced, the actor whose input triggered them, and the tool calls that
 * were exercised.
 *
 * See:
 *   - soc-simulation/docs/argus/scaffolds/m2-5-trace-schema.md
 *   - soc-simulation/docs/argus/kickoff/day-1-m2-5.md
 *   - soc-simulation/schemas/reasoning_trace.schema.json (on-cluster ES shape;
 *     a collector pipeline maps OTLP -> this schema).
 */
export const ARGUS_TRACE_ATTR = {
  agentId: 'argus.agent.id',
  agentVersion: 'argus.agent.version',
  decisionId: 'argus.decision.id',
  decisionKind: 'argus.decision.kind',
  confidence: 'argus.decision.confidence',
  confidenceDelta: 'argus.decision.confidence_delta',
  trustTier: 'argus.actor.trust_tier',
  injectionSurface: 'argus.injection.surface',
  toolId: 'argus.tool.id',
  toolInputHash: 'argus.tool.input_hash',
  correlatedAlertId: 'argus.correlation.alert_id',
} as const;

export type ArgusTraceAttrKey = keyof typeof ARGUS_TRACE_ATTR;
export type ArgusTraceAttrName = (typeof ARGUS_TRACE_ATTR)[ArgusTraceAttrKey];

/**
 * Subset of decision kinds that ARGUS agents emit. Used as a tagged union
 * so the governance dashboard can filter by kind without relying on a free
 * string.
 */
export type ArgusDecisionKind =
  | 'triage_verdict'
  | 'rule_create'
  | 'rule_patch'
  | 'rule_deprecate'
  | 'rule_eval'
  | 'rule_update'
  | 'exception_create'
  | 'case_close'
  | 'response_action'
  | 'eval_gate'
  | 'exploit_to_detection'
  | 'trust_gate'
  | 'trust_tier_assignment';

/**
 * Trust tier of the actor whose input produced this decision. Feeds the
 * autonomy gate cascade in Phase 3 (see docs/argus/phase-3/trust-tier-thresholds.md).
 */
export type ArgusTrustTier =
  | 'frontier'
  | 'trusted'
  | 'scoped'
  | 'probationary'
  | 'quarantined'
  | 'untrusted'
  | 'adversarial';

/**
 * Attribute value shape accepted by OpenTelemetry attributes. Narrowed here
 * so consumers can typecheck their calls without pulling the @opentelemetry
 * API types directly (keeping this package dep-free).
 */
export type ArgusAttrValue = string | number | boolean | ReadonlyArray<string | number | boolean>;

/**
 * Strongly-typed attribute bag for an ARGUS span. Every key is one of the
 * ARGUS_TRACE_ATTR values, and every key except `agentId` + `decisionKind`
 * is optional so partial spans (e.g. early thought events) remain valid.
 */
export interface ArgusSpanAttributes {
  [ARGUS_TRACE_ATTR.agentId]: string;
  [ARGUS_TRACE_ATTR.decisionKind]: ArgusDecisionKind;
  [ARGUS_TRACE_ATTR.agentVersion]?: string;
  [ARGUS_TRACE_ATTR.decisionId]?: string;
  [ARGUS_TRACE_ATTR.confidence]?: number;
  [ARGUS_TRACE_ATTR.confidenceDelta]?: number;
  [ARGUS_TRACE_ATTR.trustTier]?: ArgusTrustTier;
  [ARGUS_TRACE_ATTR.injectionSurface]?: string;
  [ARGUS_TRACE_ATTR.toolId]?: string;
  [ARGUS_TRACE_ATTR.toolInputHash]?: string;
  [ARGUS_TRACE_ATTR.correlatedAlertId]?: string;
}
