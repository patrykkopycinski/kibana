/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  InjectionSurfaceFlag,
  ReasoningChain,
  ReasoningChainBuildResult,
  ReasoningChainSubject,
  ReasoningStep,
  ReasoningStepType,
  TrustTier,
} from '../types';

/**
 * Shape of a single raw document from `.soc-reasoning-trace`.
 *
 * This is intentionally loose — there are TWO producers writing into this
 * index, each with a slightly different shape, and we want the builder to
 * degrade gracefully when optional fields are missing. We do NOT import the
 * OTLP span doc type from `@kbn/argus-reasoning-traces` because that package
 * is `shared-server` and this file must stay isomorphic.
 *
 * ### Schema variants
 *
 * **Demo / hand-authored spans** (`run-demo-*`, `run-live-*`):
 *   { run_id, step_index, step_type, @timestamp, actor_id, actor_trust_tier,
 *     confidence, title, body, tool_name, ... }
 *
 * **Autonomous-loop spans** (`argus-deteng-*`, `argus-watchdog-*`, …):
 *   { run_id, step_index, step_type: "run_summary"|…, @timestamp,
 *     agent_id, content, argus: { agent: {id,version}, decision: {kind,id,
 *     confidence}, actor: {trust_tier} }, gen_ai: {...} }
 *
 * Normalisation in `normaliseStep` coerces the autonomous-loop shape into
 * the demo shape so the UI can render both without branching.
 */
export interface SpanDocInput {
  readonly run_id?: string;
  readonly step_index?: number;
  readonly step_type?: string;
  readonly '@timestamp'?: string;
  readonly timestamp?: string;
  readonly actor_id?: string;
  readonly actor_trust_tier?: string;
  readonly confidence?: number;
  readonly confidence_delta?: number;
  readonly injection_surface_flags?: ReadonlyArray<{
    readonly code?: string;
    readonly severity?: string;
    readonly reason?: string;
  }>;
  readonly title?: string;
  readonly body?: string;
  readonly tool_name?: string;
  readonly tool_args_ref?: string;
  readonly tool_result_ref?: string;
  readonly source_doc_id?: string;
  readonly status?: string;
  // Autonomous-loop schema fallbacks (optional — see doc comment above).
  readonly agent_id?: string;
  readonly content?: string;
  readonly argus?: {
    readonly agent?: { readonly id?: string; readonly version?: string };
    readonly decision?: {
      readonly kind?: string;
      readonly id?: string;
      readonly confidence?: string | number;
    };
    readonly actor?: { readonly trust_tier?: string };
  };
  readonly gen_ai?: {
    readonly operation?: { readonly name?: string };
  };
}

const KNOWN_STEP_TYPES: readonly ReasoningStepType[] = [
  'thought',
  'tool_call',
  'tool_result',
  'decision',
  'recommendation',
] as const;

const KNOWN_TRUST_TIERS: readonly TrustTier[] = [
  'frontier',
  'trusted',
  'probationary',
  'quarantined',
  'system',
] as const;

const isKnownStepType = (value: string | undefined): value is ReasoningStepType =>
  value !== undefined && (KNOWN_STEP_TYPES as readonly string[]).includes(value);

const isKnownTrustTier = (value: string | undefined): value is TrustTier =>
  value !== undefined && (KNOWN_TRUST_TIERS as readonly string[]).includes(value);

const normaliseFlag = (
  raw: NonNullable<SpanDocInput['injection_surface_flags']>[number]
): InjectionSurfaceFlag | undefined => {
  if (!raw.code) return undefined;
  const severity: InjectionSurfaceFlag['severity'] =
    raw.severity === 'error' || raw.severity === 'warn' ? raw.severity : 'info';
  return {
    code: raw.code,
    severity,
    reason: raw.reason ?? '',
  };
};

/**
 * Map a raw `step_type` string to our known enum. Most demo spans already
 * use the enum verbatim; autonomous-loop spans use producer-specific values
 * like `run_summary` which we coerce to the closest match so the UI icon /
 * badge stays meaningful rather than collapsing everything to `thought`.
 */
const coerceStepType = (value: string | undefined): ReasoningStepType => {
  if (isKnownStepType(value)) return value;
  switch (value) {
    case 'run_summary':
    case 'verdict':
    case 'conclusion':
      return 'recommendation';
    case 'reconcile':
    case 'observation':
    case 'check':
      return 'decision';
    case 'invocation':
      return 'tool_call';
    case 'observation_result':
    case 'output':
      return 'tool_result';
    default:
      return 'thought';
  }
};

/**
 * Try to coerce an autonomous-loop `content` field into the demo schema's
 * `title` + `body` pair. We prefer a short, single-line title and push the
 * full payload into body. If content is already short enough, the title
 * doubles as the body.
 */
const deriveTitleBodyFromContent = (
  content: string
): { title: string; body?: string } => {
  const trimmed = content.trim();
  // Newline-split first, then length-clip — producers occasionally embed
  // multi-line rationales and the first line is almost always the summary.
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed;
  const clipped = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
  // Only return body when there's more content to show (so the UI
  // doesn't render the same string twice).
  return {
    title: clipped,
    body: trimmed.length > clipped.length ? trimmed : undefined,
  };
};

const normaliseStep = (doc: SpanDocInput, fallbackIndex: number): ReasoningStep | undefined => {
  const runId = doc.run_id;
  if (!runId) return undefined;

  const stepIndex = typeof doc.step_index === 'number' ? doc.step_index : fallbackIndex;
  const stepType: ReasoningStepType = coerceStepType(doc.step_type);
  const timestamp = doc.timestamp ?? doc['@timestamp'] ?? new Date(0).toISOString();
  const actorId =
    doc.actor_id ?? doc.agent_id ?? doc.argus?.agent?.id ?? 'unknown';
  const trustTierRaw = doc.actor_trust_tier ?? doc.argus?.actor?.trust_tier;

  // Autonomous-loop confidence is a stringified number on argus.decision
  const nestedConfidence =
    typeof doc.argus?.decision?.confidence === 'string'
      ? Number.parseFloat(doc.argus.decision.confidence)
      : typeof doc.argus?.decision?.confidence === 'number'
      ? doc.argus.decision.confidence
      : undefined;
  const confidence =
    typeof doc.confidence === 'number'
      ? doc.confidence
      : typeof nestedConfidence === 'number' && Number.isFinite(nestedConfidence)
      ? nestedConfidence
      : undefined;

  const flags = (doc.injection_surface_flags ?? [])
    .map(normaliseFlag)
    .filter((flag): flag is InjectionSurfaceFlag => Boolean(flag));

  // Resolve title/body with autonomous-loop fallbacks. Order:
  //   1. explicit title + body (demo shape) — use verbatim
  //   2. explicit title, no body — keep title, maybe fall back to content
  //   3. no title — derive from content, else gen_ai op name, else stub
  let title: string | undefined = doc.title;
  let body: string | undefined = doc.body;
  if (!title || !body) {
    const content = doc.content;
    if (content) {
      const derived = deriveTitleBodyFromContent(content);
      title = title ?? derived.title;
      body = body ?? derived.body ?? content;
    } else if (!title) {
      title = doc.gen_ai?.operation?.name ?? `${stepType} (${stepIndex})`;
    }
  }

  return {
    run_id: runId,
    step_index: stepIndex,
    step_type: stepType,
    timestamp,
    actor_id: actorId,
    actor_trust_tier_at_decision: isKnownTrustTier(trustTierRaw)
      ? trustTierRaw
      : undefined,
    confidence,
    confidence_delta: typeof doc.confidence_delta === 'number' ? doc.confidence_delta : undefined,
    injection_surface_flags: flags.length > 0 ? flags : undefined,
    title: title ?? `${stepType} (${stepIndex})`,
    body,
    tool_name: doc.tool_name,
    tool_args_ref: doc.tool_args_ref,
    tool_result_ref: doc.tool_result_ref,
    source_doc_id: doc.source_doc_id,
  };
};

const finalStatusFrom = (docs: readonly SpanDocInput[]): ReasoningChain['final_status'] => {
  const lastStatus = docs[docs.length - 1]?.status?.toLowerCase();
  switch (lastStatus) {
    case 'success':
    case 'ok':
      return 'success';
    case 'failure':
    case 'error':
      return 'failure';
    case 'aborted':
    case 'cancelled':
      return 'aborted';
    default:
      return docs.length > 0 ? 'in_progress' : 'success';
  }
};

export const buildReasoningChainFromSpanDocs = (
  docs: readonly SpanDocInput[],
  subject: ReasoningChainSubject
): ReasoningChainBuildResult => {
  if (docs.length === 0) {
    return { subject, reason_code: 'no_trace' };
  }

  const steps = docs
    .map((doc, idx) => normaliseStep(doc, idx))
    .filter((step): step is ReasoningStep => Boolean(step))
    .sort((a, b) => a.step_index - b.step_index);

  if (steps.length === 0) {
    return { subject, reason_code: 'no_trace' };
  }

  const runId = steps[0].run_id;
  const startedAt = steps[0].timestamp;
  const finishedAt = steps[steps.length - 1].timestamp;

  const chain: ReasoningChain = {
    subject,
    run_id: runId,
    steps,
    started_at: startedAt,
    finished_at: finishedAt,
    final_status: finalStatusFrom(docs),
  };

  return { subject, reason_code: 'ok', chain };
};
