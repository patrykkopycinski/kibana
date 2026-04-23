/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusEventSample,
  ArgusEventSampleClassification,
  ArgusMutationDetail,
  ArgusMutationDetailActor,
  ArgusMutationDetailAdvisory,
  ArgusMutationDetailBacktest,
  ArgusMutationDetailCoverageDelta,
  ArgusMutationDetailGate,
  ArgusMutationDetailOutcome,
  ArgusMutationDetailPatternSeed,
  ArgusMutationDetailResponse,
  ArgusMutationDetailRuleDelta,
  ArgusMutationDetailSourceSignal,
  ArgusMutationPostApplyObservation,
} from '../types/mutation_detail';
import type { ArgusMutationVerdict } from '../types/mutations';
import type { ArgusSynthesisResponse } from '../types/synthesis_proposals';

/**
 * Minimal shape of a `.soc-mutation-intents` doc consumed by the detail
 * builder. This is a superset of `RawMutationIntentDoc` (mutations_builder)
 * — it exposes the rich fields that the list view intentionally doesn't
 * pull because they'd bloat the table payload.
 */
export interface DetailRawMutationIntentDoc {
  readonly '@timestamp'?: string | null;
  readonly mutation_intent_id?: string | null;
  readonly rule_id?: string | null;
  readonly advisory_id?: string | null;
  readonly recommendation_id?: string | null;
  readonly title?: string | null;
  readonly label?: string | null;
  readonly subtitle?: string | null;
  readonly actor_id?: string | null;
  readonly actor_trust_tier?: string | null;
  readonly governance_gate?: {
    readonly status?: string | null;
    readonly reason?: string | null;
    readonly policy_id?: string | null;
    readonly thresholds?: Record<string, number | string | null> | null;
  } | null;
  readonly source_signal?: {
    readonly type?: string | null;
    readonly description?: string | null;
    readonly evidence_count?: number | null;
    readonly first_seen?: string | null;
  } | null;
  readonly proposed_rule_delta?: {
    readonly change_type?: string | null;
    readonly mitre_technique?: string | null;
    readonly severity_before?: string | null;
    readonly severity_after?: string | null;
    readonly threshold_before?: number | string | null;
    readonly threshold_after?: number | string | null;
    readonly query_before?: string | null;
    readonly query_after?: string | null;
    readonly rationale?: string | null;
  } | null;
  readonly backtest_preview?: {
    readonly tp?: number | null;
    readonly fp?: number | null;
    readonly windows?: number | null;
    readonly precision?: number | null;
    readonly fp_rate?: number | null;
    readonly gate_decision?: string | null;
  } | null;
  readonly argus?: {
    readonly actor?: {
      readonly confidence_score?: number | null;
      readonly recent_mutations?: number | null;
      readonly trust_tier?: string | null;
    };
    readonly pattern_id?: string | null;
    readonly procedure_clusters?: readonly string[] | null;
    readonly coverage_delta?: {
      readonly newly_covered_techniques?: readonly string[] | null;
      readonly newly_covered_procedures?: readonly string[] | null;
      readonly now_redundant_rule_ids?: readonly string[] | null;
      readonly snapshot_ts?: string | null;
    } | null;
  } | null;
}

export interface DetailRawOutcomeDoc {
  readonly '@timestamp'?: string | null;
  readonly mutation_intent_id?: string | null;
  readonly rule_id?: string | null;
  readonly rolled_back?: boolean | null;
  readonly rolled_back_at?: string | null;
  readonly rollback_mttr_ms?: number | null;
  readonly rollback_reason?: string | null;
  readonly applied_at?: string | null;
  readonly label?: string | null;
  readonly subtitle?: string | null;
}

export interface DetailRawAdvisoryDoc {
  readonly _id?: string | null;
  readonly advisory_id?: string | null;
  readonly cve_id?: string | null;
  readonly title?: string | null;
  readonly cvss_score?: number | null;
  readonly cvss?: number | null;
  readonly published_at?: string | null;
  readonly '@timestamp'?: string | null;
}

/**
 * Raw sample-event shape as stored on backtest / outcome docs. All fields
 * are optional because different synth pipelines emit slightly different
 * subsets — the builder normalises to `ArgusEventSample`.
 */
export interface DetailRawEventSample {
  readonly event_id?: string | null;
  readonly '@timestamp'?: string | null;
  readonly timestamp?: string | null;
  readonly host_name?: string | null;
  readonly user_name?: string | null;
  readonly process_executable?: string | null;
  readonly command_line?: string | null;
  readonly classification?: string | null;
  readonly reason?: string | null;
}

export interface DetailRawBacktestDoc {
  readonly '@timestamp'?: string | null;
  readonly rule_id?: string | null;
  readonly mutation_intent_id?: string | null;
  readonly windows_tested?: number | null;
  readonly true_positives?: number | null;
  readonly false_positives?: number | null;
  readonly precision?: number | null;
  readonly fp_rate?: number | null;
  readonly gate_decision?: string | null;
  /** Tier 2: the rule query the backtester ran against historic data. */
  readonly query?: string | null;
  readonly window_start?: string | null;
  readonly window_end?: string | null;
  readonly fp_samples?: readonly DetailRawEventSample[] | null;
  readonly tp_samples?: readonly DetailRawEventSample[] | null;
}

export interface BuildMutationDetailArgs {
  readonly mutationIntentId: string;
  readonly intent?: DetailRawMutationIntentDoc;
  readonly outcome?: DetailRawOutcomeDoc;
  readonly advisory?: DetailRawAdvisoryDoc;
  readonly backtest?: DetailRawBacktestDoc;
  /**
   * Pre-built synthesis response — the route assembles this via the
   * existing `buildSynthesisProposals` builder so we don't duplicate the
   * Pareto math here. `null` when no advisory / recommendation was
   * joined.
   */
  readonly synthesis?: ArgusSynthesisResponse | null;
  /**
   * Pre-built post-apply observation — the route assembles this by
   * querying `.alerts-security.alerts-*` in the watch window. Pass
   * `null` when the mutation has no `applied_at` (blocked rows) or the
   * watch window yielded no alerts.
   */
  readonly postApplyObservation?: ArgusMutationPostApplyObservation | null;
}

export const buildMutationDetail = ({
  mutationIntentId,
  intent,
  outcome,
  advisory,
  backtest,
  synthesis,
  postApplyObservation,
}: BuildMutationDetailArgs): ArgusMutationDetailResponse => {
  if (!intent && !outcome) {
    return { reason_code: 'not_found', detail: null };
  }

  const verdict = inferVerdict(intent, outcome);
  const timestamp =
    verdict === 'blocked'
      ? intent?.['@timestamp'] ?? ''
      : outcome?.['@timestamp'] ?? intent?.['@timestamp'] ?? '';

  const ruleDelta = buildRuleDelta(intent);

  const detail: ArgusMutationDetail = {
    mutation_intent_id: mutationIntentId,
    rule_id: intent?.rule_id ?? outcome?.rule_id ?? null,
    verdict,
    timestamp,
    title: intent?.title ?? outcome?.label ?? null,
    label: intent?.label ?? outcome?.label ?? null,
    subtitle: intent?.subtitle ?? outcome?.subtitle ?? null,
    gate: buildGate(intent),
    source_signal: buildSourceSignal(intent),
    proposed_rule_delta: ruleDelta,
    synthesis: synthesis ?? null,
    backtest: buildBacktest(intent, backtest, ruleDelta?.query_after ?? null),
    outcome: buildOutcome(outcome, postApplyObservation ?? null),
    actor: buildActor(intent),
    advisory: buildAdvisory(advisory),
    audit: {
      mutation_intent_id: mutationIntentId,
      rule_id: intent?.rule_id ?? outcome?.rule_id ?? null,
      advisory_id: intent?.advisory_id ?? advisory?.advisory_id ?? advisory?._id ?? null,
      recommendation_id: intent?.recommendation_id ?? null,
    },
    pattern_seed: buildPatternSeed(intent),
    coverage_delta: buildCoverageDelta(intent),
  };

  return { reason_code: 'ok', detail };
};

const buildPatternSeed = (
  intent: DetailRawMutationIntentDoc | undefined
): ArgusMutationDetailPatternSeed | null => {
  const argus = intent?.argus;
  if (!argus) return null;
  const hasPatternId = Object.prototype.hasOwnProperty.call(argus, 'pattern_id');
  const hasClusters = Array.isArray(argus.procedure_clusters);
  // Treat pre-Tier-2 intents (no `pattern_id` key at all AND no clusters
  // array) as "no seed". A `pattern_id: null` with clusters is valid —
  // the synthesizer ran but matched nothing and we want the UI to say so.
  if (!hasPatternId && !hasClusters) return null;
  const clusters = hasClusters
    ? (argus.procedure_clusters as readonly string[]).filter(
        (s) => typeof s === 'string' && s.length > 0
      )
    : [];
  return {
    pattern_id: hasPatternId ? argus.pattern_id ?? null : null,
    procedure_clusters: clusters,
  };
};

const buildCoverageDelta = (
  intent: DetailRawMutationIntentDoc | undefined
): ArgusMutationDetailCoverageDelta | null => {
  const raw = intent?.argus?.coverage_delta;
  if (!raw) return null;
  const snapshot = normaliseString(raw.snapshot_ts);
  // Without a snapshot_ts we can't trust the delta — surface nothing
  // rather than rendering a delta that can't be compared to a snapshot.
  if (!snapshot) return null;
  return {
    newly_covered_techniques: Array.isArray(raw.newly_covered_techniques)
      ? raw.newly_covered_techniques.filter((s) => typeof s === 'string' && s.length > 0)
      : [],
    newly_covered_procedures: Array.isArray(raw.newly_covered_procedures)
      ? raw.newly_covered_procedures.filter((s) => typeof s === 'string' && s.length > 0)
      : [],
    now_redundant_rule_ids: Array.isArray(raw.now_redundant_rule_ids)
      ? raw.now_redundant_rule_ids.filter((s) => typeof s === 'string' && s.length > 0)
      : [],
    snapshot_ts: snapshot,
  };
};

const inferVerdict = (
  intent: DetailRawMutationIntentDoc | undefined,
  outcome: DetailRawOutcomeDoc | undefined
): ArgusMutationVerdict => {
  // Outcome is the authoritative post-apply leg. A rolled_back outcome
  // wins over any intent-side status because the mutation *did* leave
  // the gate — the intent's own `status` may still read `approved`.
  if (outcome) return outcome.rolled_back === true ? 'rolled_back' : 'applied';
  if (intent?.governance_gate?.status === 'blocked') return 'blocked';
  // If we somehow have an intent with no outcome and no blocked gate we
  // still need to resolve to a verdict. Treat it as blocked so the UI
  // asks for human review instead of silently pretending it was applied.
  return 'blocked';
};

const buildGate = (intent: DetailRawMutationIntentDoc | undefined): ArgusMutationDetailGate => ({
  status: intent?.governance_gate?.status ?? null,
  reason: normaliseString(intent?.governance_gate?.reason),
  policy_id: normaliseString(intent?.governance_gate?.policy_id),
  thresholds: intent?.governance_gate?.thresholds
    ? cloneThresholds(intent.governance_gate.thresholds)
    : null,
});

const buildSourceSignal = (
  intent: DetailRawMutationIntentDoc | undefined
): ArgusMutationDetailSourceSignal | null => {
  const raw = intent?.source_signal;
  if (!raw) return null;
  const description = normaliseString(raw.description);
  const type = normaliseString(raw.type);
  if (!type && !description) return null;
  return {
    type: type ?? 'unknown',
    description: description ?? '',
    evidence_count: finiteOrNull(raw.evidence_count),
    first_seen: normaliseString(raw.first_seen),
  };
};

const RULE_DELTA_CHANGE_TYPES = ['tune', 'create', 'retire', 'replace'] as const;

const buildRuleDelta = (
  intent: DetailRawMutationIntentDoc | undefined
): ArgusMutationDetailRuleDelta | null => {
  const raw = intent?.proposed_rule_delta;
  if (!raw) return null;
  // Skip the whole block if every field is empty — no point rendering
  // a blank "Proposed rule change" section in the flyout.
  const severityBefore = normaliseString(raw.severity_before);
  const severityAfter = normaliseString(raw.severity_after);
  const thresholdBefore = coerceThresholdValue(raw.threshold_before);
  const thresholdAfter = coerceThresholdValue(raw.threshold_after);
  const queryBefore = normaliseString(raw.query_before);
  const queryAfter = normaliseString(raw.query_after);
  const rationale = normaliseString(raw.rationale);
  const technique = normaliseString(raw.mitre_technique);
  const hasAnything =
    severityBefore ||
    severityAfter ||
    thresholdBefore !== null ||
    thresholdAfter !== null ||
    queryBefore ||
    queryAfter ||
    rationale ||
    technique;
  if (!hasAnything) return null;
  const changeType = RULE_DELTA_CHANGE_TYPES.find((k) => k === raw.change_type) ?? null;
  return {
    change_type: changeType,
    mitre_technique: technique,
    severity_before: severityBefore,
    severity_after: severityAfter,
    threshold_before: thresholdBefore,
    threshold_after: thresholdAfter,
    query_before: queryBefore,
    query_after: queryAfter,
    rationale,
  };
};

const buildBacktest = (
  intent: DetailRawMutationIntentDoc | undefined,
  backtest: DetailRawBacktestDoc | undefined,
  ruleQueryAfter: string | null
): ArgusMutationDetailBacktest | null => {
  // Prefer the authoritative `.soc-backtests` row when it exists;
  // fall back to the cached preview on the intent for blocked rows that
  // never got a real backtest run.
  if (backtest) {
    const tp = finiteOrNull(backtest.true_positives) ?? 0;
    const fp = finiteOrNull(backtest.false_positives) ?? 0;
    const windows = finiteOrNull(backtest.windows_tested) ?? 0;
    const precision = finiteOrNull(backtest.precision) ?? (tp + fp > 0 ? tp / (tp + fp) : null);
    const fpRate = finiteOrNull(backtest.fp_rate) ?? (tp + fp > 0 ? fp / (tp + fp) : null);
    return {
      tp,
      fp,
      windows,
      precision,
      fp_rate: fpRate,
      gate_decision: normaliseString(backtest.gate_decision),
      query: normaliseString(backtest.query) ?? ruleQueryAfter,
      window_start: normaliseString(backtest.window_start),
      window_end: normaliseString(backtest.window_end),
      fp_samples: normaliseSamples(backtest.fp_samples, 'fp'),
      tp_samples: normaliseSamples(backtest.tp_samples, 'tp'),
    };
  }
  const preview = intent?.backtest_preview;
  if (!preview) return null;
  const tp = finiteOrNull(preview.tp) ?? 0;
  const fp = finiteOrNull(preview.fp) ?? 0;
  const windows = finiteOrNull(preview.windows) ?? 0;
  if (tp === 0 && fp === 0 && windows === 0) return null;
  return {
    tp,
    fp,
    windows,
    precision: finiteOrNull(preview.precision) ?? (tp + fp > 0 ? tp / (tp + fp) : null),
    fp_rate: finiteOrNull(preview.fp_rate) ?? (tp + fp > 0 ? fp / (tp + fp) : null),
    gate_decision: normaliseString(preview.gate_decision),
    query: ruleQueryAfter,
    window_start: null,
    window_end: null,
    fp_samples: [],
    tp_samples: [],
  };
};

const buildOutcome = (
  outcome: DetailRawOutcomeDoc | undefined,
  postApplyObservation: ArgusMutationPostApplyObservation | null
): ArgusMutationDetailOutcome | null => {
  if (!outcome) return null;
  return {
    applied_at: normaliseString(outcome.applied_at),
    rolled_back: outcome.rolled_back === true,
    rolled_back_at: normaliseString(outcome.rolled_back_at),
    rollback_reason: normaliseString(outcome.rollback_reason) ?? normaliseString(outcome.subtitle),
    rollback_mttr_ms: finiteOrNull(outcome.rollback_mttr_ms),
    label: normaliseString(outcome.label),
    post_apply_observation: postApplyObservation,
  };
};

const normaliseSampleClassification = (
  raw: string | null | undefined,
  fallback: ArgusEventSampleClassification
): ArgusEventSampleClassification => {
  const trimmed = normaliseString(raw ?? null);
  if (trimmed === 'fp' || trimmed === 'tp' || trimmed === 'unclassified') return trimmed;
  return fallback;
};

const normaliseSamples = (
  samples: readonly DetailRawEventSample[] | null | undefined,
  fallbackClassification: ArgusEventSampleClassification
): readonly ArgusEventSample[] => {
  if (!Array.isArray(samples) || samples.length === 0) return [];
  const out: ArgusEventSample[] = [];
  for (const sample of samples) {
    if (!sample) continue;
    const eventId = normaliseString(sample.event_id);
    if (!eventId) continue;
    out.push({
      event_id: eventId,
      timestamp: normaliseString(sample.timestamp) ?? normaliseString(sample['@timestamp']),
      host_name: normaliseString(sample.host_name),
      user_name: normaliseString(sample.user_name),
      process_executable: normaliseString(sample.process_executable),
      command_line: normaliseString(sample.command_line),
      classification: normaliseSampleClassification(sample.classification, fallbackClassification),
      reason: normaliseString(sample.reason),
    });
  }
  return out;
};

const buildActor = (intent: DetailRawMutationIntentDoc | undefined): ArgusMutationDetailActor => ({
  id: normaliseString(intent?.actor_id),
  trust_tier:
    normaliseString(intent?.actor_trust_tier) ?? normaliseString(intent?.argus?.actor?.trust_tier),
  confidence_score: finiteOrNull(intent?.argus?.actor?.confidence_score),
  recent_mutations: finiteOrNull(intent?.argus?.actor?.recent_mutations),
});

const buildAdvisory = (
  advisory: DetailRawAdvisoryDoc | undefined
): ArgusMutationDetailAdvisory | null => {
  if (!advisory) return null;
  const advisoryId = normaliseString(advisory.advisory_id) ?? normaliseString(advisory._id);
  const cveId = normaliseString(advisory.cve_id);
  const title = normaliseString(advisory.title);
  const cvss = finiteOrNull(advisory.cvss_score) ?? finiteOrNull(advisory.cvss);
  const publishedAt =
    normaliseString(advisory.published_at) ?? normaliseString(advisory['@timestamp']);
  if (!advisoryId && !cveId && !title) return null;
  return {
    advisory_id: advisoryId,
    cve_id: cveId,
    title,
    cvss,
    published_at: publishedAt,
  };
};

const normaliseString = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const finiteOrNull = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
};

const coerceThresholdValue = (
  value: number | string | null | undefined
): number | string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const cloneThresholds = (
  raw: Record<string, number | string | null>
): Record<string, number | string | null> => {
  const out: Record<string, number | string | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === 'number') {
      out[key] = Number.isFinite(value) ? value : null;
    } else {
      out[key] = String(value);
    }
  }
  return out;
};
