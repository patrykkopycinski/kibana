/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ARGUS_TRACE_ATTR, type ArgusDecisionKind, type ArgusTrustTier } from './trace_attributes';

/**
 * Argus M2.5 — reasoning-trace document emitter.
 *
 * The OTLP exporter path (see `otlp_exporter.ts`) remains the production
 * target for agents that already use the OpenTelemetry SDK. But the SOC
 * simulation — and every Kibana Workflow step that calls an LLM — runs
 * inside the Elasticsearch-native workflow engine, which can only append
 * documents to a data stream. `emitArgusSpanDoc` is the bridge: it returns
 * the exact document shape that `.soc-reasoning-trace` expects, with the
 * `argus.*` governance namespace populated from the standardised attribute
 * contract.
 *
 * Keeping this helper dependency-free (no ES client, no @opentelemetry) lets
 * three consumers share it:
 *   - Kibana Workflows (via JSON/YAML, by reading the emitted doc's shape).
 *   - Security Solution server-side agent runners (direct call).
 *   - The standalone CLI (`scripts/run_detection_eval.ts` pairs naturally).
 */

export interface EmitArgusSpanDocInput {
  /**
   * Workflow / agent run identifier. Stays flat at `run_id` for
   * backward-compatibility with the pre-Argus `.soc-reasoning-trace` consumers.
   */
  runId: string;

  /** Zero-based index of this step within the agent run. */
  stepIndex: number;

  /** One of `thought`, `tool_call`, `tool_result`, `final`, … */
  stepType: string;

  /** Human-readable reasoning content (may be redacted upstream). */
  content?: string;

  /** Tool invoked (if stepType is `tool_call`/`tool_result`). */
  toolName?: string;

  /** Pointer (URI or saved-object id) to tool args / results. */
  toolArgs?: Record<string, unknown>;
  toolResultRef?: string;

  /** Totals that close the run — only present on the `final` step. */
  totalSteps?: number;
  toolCallCount?: number;
  totalDurationMs?: number;
  finalStatus?: string;
  finalOutputRef?: string;

  /**
   * Argus governance attributes. `agentId` + `decisionKind` are required;
   * everything else is optional so partial "thought" steps are accepted.
   */
  argus: {
    agentId: string;
    agentVersion?: string;
    decisionKind: ArgusDecisionKind;
    decisionId?: string;
    confidence?: number;
    confidenceDelta?: number;
    trustTier?: ArgusTrustTier;
    injectionSurface?: string;
    toolId?: string;
    toolInputHash?: string;
    correlatedAlertId?: string;
  };

  /**
   * Clock seam for deterministic testing. Defaults to `new Date()`. Production
   * callers should leave this unset.
   */
  now?: () => Date;
}

export interface ArgusSpanDoc {
  '@timestamp': string;
  run_id: string;
  agent_id: string;
  step_index: number;
  step_type: string;
  content?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result_ref?: string;
  total_steps?: number;
  tool_call_count?: number;
  total_duration_ms?: number;
  final_status?: string;
  final_output_ref?: string;
  argus: {
    agent: { id: string; version?: string };
    decision: {
      kind: ArgusDecisionKind;
      id?: string;
      confidence?: number;
      confidence_delta?: number;
    };
    actor?: { trust_tier?: ArgusTrustTier };
    injection?: { surface?: string };
    tool?: { id?: string; input_hash?: string };
    correlation?: { alert_id?: string };
  };
  /**
   * Attribute bag mirroring the OTLP `ARGUS_TRACE_ATTR` contract, so a single
   * document is queryable by either the flat ES-native `argus.*` fields or by
   * the OTLP-compatible dotted attribute names. This is the backward-compat
   * bridge for existing governance dashboards that were built against OTLP
   * spans in the prior design.
   */
  attributes: Record<string, string | number | boolean>;
}

const nowDefault = () => new Date();

const validatePositiveInt = (name: string, value: number | undefined) => {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new Error(`emitArgusSpanDoc: ${name} must be a non-negative integer, got ${value}`);
  }
};

const validateConfidence = (name: string, value: number | undefined) => {
  if (value !== undefined && (Number.isNaN(value) || value < -1 || value > 1)) {
    throw new Error(
      `emitArgusSpanDoc: ${name} must be a finite number in [-1, 1] (got ${value}) — ` +
        'confidence is expressed on the unit interval and confidence_delta is bounded by ±1.'
    );
  }
};

/**
 * Build a reasoning-trace document ready to be bulk-indexed into
 * `.soc-reasoning-trace`. Validates the inputs enough to catch the common
 * workflow-authoring mistakes (missing agent/decision, out-of-range
 * confidence, negative step index) without becoming a general schema gate —
 * that's the cluster's job.
 */
export const emitArgusSpanDoc = (input: EmitArgusSpanDocInput): ArgusSpanDoc => {
  if (!input.runId) throw new Error('emitArgusSpanDoc: runId is required');
  if (!input.stepType) throw new Error('emitArgusSpanDoc: stepType is required');
  if (!input.argus?.agentId) throw new Error('emitArgusSpanDoc: argus.agentId is required');
  if (!input.argus?.decisionKind)
    throw new Error('emitArgusSpanDoc: argus.decisionKind is required');
  validatePositiveInt('stepIndex', input.stepIndex);
  validatePositiveInt('totalSteps', input.totalSteps);
  validatePositiveInt('toolCallCount', input.toolCallCount);
  validatePositiveInt('totalDurationMs', input.totalDurationMs);
  validateConfidence('confidence', input.argus.confidence);
  validateConfidence('confidenceDelta', input.argus.confidenceDelta);

  const timestamp = (input.now ?? nowDefault)().toISOString();

  const attributes: Record<string, string | number | boolean> = {
    [ARGUS_TRACE_ATTR.agentId]: input.argus.agentId,
    [ARGUS_TRACE_ATTR.decisionKind]: input.argus.decisionKind,
  };
  if (input.argus.agentVersion !== undefined) {
    attributes[ARGUS_TRACE_ATTR.agentVersion] = input.argus.agentVersion;
  }
  if (input.argus.decisionId !== undefined) {
    attributes[ARGUS_TRACE_ATTR.decisionId] = input.argus.decisionId;
  }
  if (input.argus.confidence !== undefined) {
    attributes[ARGUS_TRACE_ATTR.confidence] = input.argus.confidence;
  }
  if (input.argus.confidenceDelta !== undefined) {
    attributes[ARGUS_TRACE_ATTR.confidenceDelta] = input.argus.confidenceDelta;
  }
  if (input.argus.trustTier !== undefined) {
    attributes[ARGUS_TRACE_ATTR.trustTier] = input.argus.trustTier;
  }
  if (input.argus.injectionSurface !== undefined) {
    attributes[ARGUS_TRACE_ATTR.injectionSurface] = input.argus.injectionSurface;
  }
  if (input.argus.toolId !== undefined) {
    attributes[ARGUS_TRACE_ATTR.toolId] = input.argus.toolId;
  }
  if (input.argus.toolInputHash !== undefined) {
    attributes[ARGUS_TRACE_ATTR.toolInputHash] = input.argus.toolInputHash;
  }
  if (input.argus.correlatedAlertId !== undefined) {
    attributes[ARGUS_TRACE_ATTR.correlatedAlertId] = input.argus.correlatedAlertId;
  }

  const argusBlock: ArgusSpanDoc['argus'] = {
    agent: {
      id: input.argus.agentId,
      ...(input.argus.agentVersion !== undefined ? { version: input.argus.agentVersion } : {}),
    },
    decision: {
      kind: input.argus.decisionKind,
      ...(input.argus.decisionId !== undefined ? { id: input.argus.decisionId } : {}),
      ...(input.argus.confidence !== undefined ? { confidence: input.argus.confidence } : {}),
      ...(input.argus.confidenceDelta !== undefined
        ? { confidence_delta: input.argus.confidenceDelta }
        : {}),
    },
  };
  if (input.argus.trustTier !== undefined) {
    argusBlock.actor = { trust_tier: input.argus.trustTier };
  }
  if (input.argus.injectionSurface !== undefined) {
    argusBlock.injection = { surface: input.argus.injectionSurface };
  }
  if (input.argus.toolId !== undefined || input.argus.toolInputHash !== undefined) {
    argusBlock.tool = {
      ...(input.argus.toolId !== undefined ? { id: input.argus.toolId } : {}),
      ...(input.argus.toolInputHash !== undefined ? { input_hash: input.argus.toolInputHash } : {}),
    };
  }
  if (input.argus.correlatedAlertId !== undefined) {
    argusBlock.correlation = { alert_id: input.argus.correlatedAlertId };
  }

  const doc: ArgusSpanDoc = {
    '@timestamp': timestamp,
    run_id: input.runId,
    agent_id: input.argus.agentId,
    step_index: input.stepIndex,
    step_type: input.stepType,
    argus: argusBlock,
    attributes,
  };

  if (input.content !== undefined) doc.content = input.content;
  if (input.toolName !== undefined) doc.tool_name = input.toolName;
  if (input.toolArgs !== undefined) doc.tool_args = input.toolArgs;
  if (input.toolResultRef !== undefined) doc.tool_result_ref = input.toolResultRef;
  if (input.totalSteps !== undefined) doc.total_steps = input.totalSteps;
  if (input.toolCallCount !== undefined) doc.tool_call_count = input.toolCallCount;
  if (input.totalDurationMs !== undefined) doc.total_duration_ms = input.totalDurationMs;
  if (input.finalStatus !== undefined) doc.final_status = input.finalStatus;
  if (input.finalOutputRef !== undefined) doc.final_output_ref = input.finalOutputRef;

  return doc;
};

/**
 * Index where {@link emitArgusSpanDoc} documents should be written. Exposed as
 * a constant so every producer points at the same stream even if the name is
 * later refactored (e.g. to roll over to versioned indices).
 */
export const ARGUS_REASONING_TRACE_INDEX = '.soc-reasoning-trace';
