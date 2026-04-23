/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusAutonomyCounts,
  ArgusAutonomyDecision,
  ArgusAutonomyFinalStatus,
  ArgusAutonomyResponse,
} from '../types/autonomy_decisions';

/**
 * Loose shape the builder accepts. `source_agent`, `gates_*`, `trust_tier`
 * etc. may or may not be present depending on which workflow wrote the doc.
 * We read everything defensively.
 */
export interface RawAutonomyDecisionDoc {
  readonly '@timestamp'?: unknown;
  readonly rec_id?: unknown;
  readonly artifact_type?: unknown;
  readonly artifact_id?: unknown;
  readonly op?: unknown;
  readonly action?: unknown;
  readonly source_agent?: unknown;
  readonly source_workflow?: unknown;
  readonly gates_evaluated?: unknown;
  readonly gates_passed?: unknown;
  readonly first_failing_gate?: unknown;
  readonly final_status?: unknown;
  readonly auto_applied?: unknown;
  readonly required_human?: unknown;
  readonly review_reason?: unknown;
  readonly trust_tier?: unknown;
  readonly trust_score?: unknown;
  readonly backtest_verdict?: unknown;
  readonly backtest_ref?: unknown;
  readonly confidence?: unknown;
  readonly decision_duration_ms?: unknown;
}

export interface RawAutonomyHit {
  readonly doc_id: string;
  readonly source: RawAutonomyDecisionDoc;
}

export interface BuildAutonomyDecisionsArgs {
  readonly hits: readonly RawAutonomyHit[];
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 100;
const HARD_CAP = 500;

/**
 * Map the verbatim `final_status` the producer workflows emit onto one of
 * the five semantic buckets the UI groups by. Producers use finer-grained
 * statuses than the UI wants to surface as counts, so we fold them here.
 *
 * Kept as a const map (rather than a regex) so the mapping is reviewable
 * and grep-able, and so new producer statuses surface as `unknown` instead
 * of being silently miscategorised.
 */
const RAW_STATUS_TO_BUCKET: Readonly<Record<string, ArgusAutonomyFinalStatus>> = {
  // terminal success
  applied: 'auto_applied',
  clean: 'auto_applied',
  auto_applied: 'auto_applied',

  // terminal rollback
  rolled_back: 'rolled_back',

  // terminal rejection (hard failures + drift guards + regression guards)
  rejected: 'rejected',
  rejected_backtest: 'rejected',
  rejected_drift: 'rejected',
  rejected_by_human: 'rejected',
  regression_detected: 'rejected',

  // awaiting a human
  pending_review: 'required_human',
  required_human: 'required_human',
  approved_by_human: 'required_human',

  // in-flight, not terminal
  pending_backtest: 'deferred',
  auto_apply_ready: 'deferred',
  applying: 'deferred',
  inconclusive: 'deferred',
  deferred: 'deferred',
};

export const buildAutonomyDecisions = ({
  hits,
  windowStart,
  windowEnd,
  limit = DEFAULT_LIMIT,
}: BuildAutonomyDecisionsArgs): ArgusAutonomyResponse => {
  const effectiveLimit = Math.max(1, Math.min(limit, HARD_CAP));

  const decisions: ArgusAutonomyDecision[] = [];
  for (const hit of hits) {
    const decision = hitToDecision(hit);
    if (decision) decisions.push(decision);
  }

  decisions.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const counts = countByFinalStatus(decisions);

  const truncated = decisions.length > effectiveLimit;
  const visible = truncated ? decisions.slice(0, effectiveLimit) : decisions;

  return {
    window_start: windowStart,
    window_end: windowEnd,
    decisions: visible,
    counts,
    truncated,
  };
};

export const hitToDecision = ({
  doc_id: docId,
  source,
}: RawAutonomyHit): ArgusAutonomyDecision | null => {
  const timestamp = readString(source['@timestamp']);
  const artifactId = readString(source.artifact_id) ?? readString(source.rec_id);
  if (!timestamp || !artifactId) return null;

  const autoApplied = readBool(source.auto_applied);
  const requiredHuman = readBool(source.required_human);
  const rawFinalStatus = readString(source.final_status);
  const finalStatus = deriveFinalStatusBucket({ rawFinalStatus, autoApplied, requiredHuman });

  return {
    id: docId,
    timestamp,
    rec_id: readString(source.rec_id),
    artifact_type: readString(source.artifact_type),
    artifact_id: artifactId,
    action: readString(source.action) ?? readString(source.op),
    source_agent: readString(source.source_agent),
    source_workflow: readString(source.source_workflow),
    gates_evaluated: readStringArray(source.gates_evaluated),
    gates_passed: readStringArray(source.gates_passed),
    first_failing_gate: readString(source.first_failing_gate),
    final_status: finalStatus,
    raw_final_status: rawFinalStatus,
    auto_applied: autoApplied,
    required_human: requiredHuman,
    review_reason: readString(source.review_reason),
    trust_tier: readString(source.trust_tier),
    trust_score: readFiniteNumber(source.trust_score),
    backtest_verdict: readString(source.backtest_verdict),
    backtest_ref: readString(source.backtest_ref),
    confidence: readFiniteNumber(source.confidence),
    decision_duration_ms: readFiniteNumber(source.decision_duration_ms),
  };
};

const countByFinalStatus = (decisions: readonly ArgusAutonomyDecision[]): ArgusAutonomyCounts => {
  const counts = {
    total: decisions.length,
    auto_applied: 0,
    deferred: 0,
    required_human: 0,
    rejected: 0,
    rolled_back: 0,
  };
  for (const d of decisions) {
    switch (d.final_status) {
      case 'auto_applied':
        counts.auto_applied += 1;
        break;
      case 'deferred':
        counts.deferred += 1;
        break;
      case 'required_human':
        counts.required_human += 1;
        break;
      case 'rejected':
        counts.rejected += 1;
        break;
      case 'rolled_back':
        counts.rolled_back += 1;
        break;
      case 'unknown':
        break;
    }
  }
  return counts;
};

/**
 * Derive the UI bucket from the real producer signal. The `auto_applied` and
 * `required_human` boolean flags take precedence over the status string for
 * the two buckets they unambiguously map to, because some producers set the
 * flag without emitting a terminal status (e.g. `applying`).
 */
const deriveFinalStatusBucket = (args: {
  rawFinalStatus: string | undefined;
  autoApplied: boolean | undefined;
  requiredHuman: boolean | undefined;
}): ArgusAutonomyFinalStatus => {
  const { rawFinalStatus, autoApplied, requiredHuman } = args;
  const raw = rawFinalStatus?.toLowerCase();

  if (raw && raw in RAW_STATUS_TO_BUCKET) {
    return RAW_STATUS_TO_BUCKET[raw];
  }

  if (requiredHuman === true) return 'required_human';
  if (autoApplied === true) return 'auto_applied';

  // A raw value that was set but unknown to us deserves a one-time warning
  // in dev (builder is pure, so just tag it as `unknown` — the raw value is
  // preserved on `raw_final_status` for the UI to surface).
  return 'unknown';
};

const readString = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

const readStringArray = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    const s = readString(item);
    if (s) out.push(s);
  }
  return out.length > 0 ? out : undefined;
};

const readBool = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return undefined;
};

const readFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};
