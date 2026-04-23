/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusMutationVerdict } from './mutations';
import type { ArgusSynthesisResponse } from './synthesis_proposals';

/**
 * Governance gate state carried on every mutation intent doc. `thresholds`
 * is an open bag because different policies enforce different numeric
 * bars — rendering is agnostic (key: value pairs).
 */
export interface ArgusMutationDetailGate {
  readonly status: string | null;
  readonly reason: string | null;
  readonly policy_id: string | null;
  readonly thresholds: Readonly<Record<string, number | string | null>> | null;
}

/**
 * The upstream signal that caused Argus to propose the mutation in the
 * first place. `type` is open-ended so the UI renders whatever category
 * the agent emitted; the common ones are:
 *   - `drift_detected`            — rule-efficacy drift on production
 *   - `exploit_telemetry`         — fresh exploit runs from Caldera
 *   - `false_positive_report`     — SOC-reported FP batch above threshold
 *   - `new_cve_advisory`          — a new advisory entered the pipeline
 *   - `threat_intel_match`        — TI match on inbound telemetry
 */
export interface ArgusMutationDetailSourceSignal {
  readonly type: string;
  readonly description: string;
  readonly evidence_count: number | null;
  readonly first_seen: string | null;
}

/**
 * Before/after view of the proposed rule change. Fields are independently
 * optional — a trivial tuning change might only touch `threshold`, while
 * a net-new rule won't have a `_before` value. The flyout renders each
 * non-null pair as a diff row.
 */
export interface ArgusMutationDetailRuleDelta {
  readonly change_type: 'tune' | 'create' | 'retire' | 'replace' | null;
  readonly mitre_technique: string | null;
  readonly severity_before: string | null;
  readonly severity_after: string | null;
  readonly threshold_before: number | string | null;
  readonly threshold_after: number | string | null;
  readonly query_before: string | null;
  readonly query_after: string | null;
  readonly rationale: string | null;
}

/**
 * Classification of a sampled event surfaced alongside backtest or
 * post-apply observation data. `fp` / `tp` follow the backtester or the
 * SOC analyst's judgement; `unclassified` is a post-apply alert that
 * wasn't dispositioned before auto-rollback fired.
 */
export type ArgusEventSampleClassification = 'fp' | 'tp' | 'unclassified';

/**
 * A single sample event rendered in the flyout's sample-event tables.
 * Shape is deliberately narrow — enough to convey which host/user/
 * process triggered the detection without leaking the full alert doc.
 */
export interface ArgusEventSample {
  readonly event_id: string;
  readonly timestamp: string | null;
  readonly host_name: string | null;
  readonly user_name: string | null;
  readonly process_executable: string | null;
  readonly command_line: string | null;
  readonly classification: ArgusEventSampleClassification;
  /** Short human-readable justification ("dismissed by analyst", "matches baseline noise cluster"). */
  readonly reason: string | null;
}

/**
 * Preview of the backtest that was (or would have been) run against the
 * candidate. For blocked rows this is the cached backtest the synthesis
 * step produced; for applied/rolled_back rows it's the authoritative
 * backtest from `.soc-backtest-results`.
 *
 * `query` / `window_*` / `*_samples` are populated when the backtest
 * doc carries that evidence (Tier 2 backtest docs). For legacy docs
 * they default to `null` / `[]` and the flyout renders only the
 * aggregate counters.
 */
export interface ArgusMutationDetailBacktest {
  readonly tp: number;
  readonly fp: number;
  readonly windows: number;
  readonly precision: number | null;
  readonly fp_rate: number | null;
  readonly gate_decision: string | null;
  /** The rule query the backtester actually ran against historic data. */
  readonly query: string | null;
  readonly window_start: string | null;
  readonly window_end: string | null;
  /** Sample events the backtester judged as false positives. */
  readonly fp_samples: readonly ArgusEventSample[];
  /** Sample events the backtester judged as true positives. */
  readonly tp_samples: readonly ArgusEventSample[];
}

/**
 * Actor trail — surfaces who / what proposed the mutation and how much
 * trust the agent has accrued. `recent_mutations` is a 24h rolling count
 * so a reviewer can spot a noisy agent.
 */
export interface ArgusMutationDetailActor {
  readonly id: string | null;
  readonly trust_tier: string | null;
  readonly confidence_score: number | null;
  readonly recent_mutations: number | null;
}

/** CVE / advisory context for the mutation. Null when the mutation is
 *  a generic tuning unrelated to any advisory. */
export interface ArgusMutationDetailAdvisory {
  readonly advisory_id: string | null;
  readonly cve_id: string | null;
  readonly title: string | null;
  readonly cvss: number | null;
  readonly published_at: string | null;
}

/**
 * Post-apply observation — the evidence the watch window collected from
 * `.alerts-security.alerts-*` after the rule went live. For rolled-back
 * mutations this answers "why did auto-rollback fire?"; for applied
 * mutations it shows the live hit rate so the reviewer can sanity-check
 * the rule.
 *
 * The backend joins by `kibana.alert.argus.mutation_intent_id` (for
 * Argus-authored rules) or by rule UUID when that tag is absent.
 * `alerts_deep_link_url` is a pre-rendered link to the Alerts page
 * filtered by the same criteria so reviewers can drill into the raw
 * data.
 */
export interface ArgusMutationPostApplyObservation {
  readonly window_start: string;
  readonly window_end: string;
  readonly alerts_total: number;
  readonly alerts_classified_fp: number;
  readonly alerts_classified_tp: number;
  readonly sample_events: readonly ArgusEventSample[];
  readonly alerts_deep_link_url: string | null;
}

/**
 * Outcome leg — only populated for `applied` and `rolled_back` rows.
 * Joined server-side via `mutation_intent_id` from `.soc-outcomes`.
 */
export interface ArgusMutationDetailOutcome {
  readonly applied_at: string | null;
  readonly rolled_back: boolean;
  readonly rolled_back_at: string | null;
  readonly rollback_reason: string | null;
  readonly rollback_mttr_ms: number | null;
  readonly label: string | null;
  /**
   * Post-apply observation collected from `.alerts-security.alerts-*`.
   * `null` when no `applied_at` is recorded (blocked rows) or when the
   * watch window yielded zero alerts.
   */
  readonly post_apply_observation: ArgusMutationPostApplyObservation | null;
}

export interface ArgusMutationDetailAudit {
  readonly mutation_intent_id: string;
  readonly rule_id: string | null;
  readonly advisory_id: string | null;
  readonly recommendation_id: string | null;
}

/**
 * Tier 2 — coverage delta the mutation would move when applied. Scored
 * against the coverage snapshot at synthesis time (`snapshot_ts`), which
 * we keep on the payload so the flyout can show a warning if the delta
 * is stale vs the current snapshot.
 */
export interface ArgusMutationDetailCoverageDelta {
  readonly newly_covered_techniques: readonly string[];
  readonly newly_covered_procedures: readonly string[];
  readonly now_redundant_rule_ids: readonly string[];
  readonly snapshot_ts: string;
}

/**
 * Tier 2 — pattern-seeded synthesis metadata. `pattern_id = null` is an
 * explicit "no pattern matched" signal, distinct from an omitted field.
 */
export interface ArgusMutationDetailPatternSeed {
  readonly pattern_id: string | null;
  readonly procedure_clusters: readonly string[];
}

/**
 * Full detail payload backing the mutation-detail flyout. All fields
 * except the required audit / gate / actor legs may be null — the UI
 * renders only the sections for which data is present.
 */
export interface ArgusMutationDetail {
  readonly mutation_intent_id: string;
  readonly rule_id: string | null;
  readonly verdict: ArgusMutationVerdict;
  readonly timestamp: string;
  readonly title: string | null;
  readonly label: string | null;
  readonly subtitle: string | null;
  readonly gate: ArgusMutationDetailGate;
  readonly source_signal: ArgusMutationDetailSourceSignal | null;
  readonly proposed_rule_delta: ArgusMutationDetailRuleDelta | null;
  /**
   * Reuses `ArgusSynthesisResponse` so the flyout can share the Pareto
   * rendering with the existing Proposals tab. `null` when no advisory
   * was linked (e.g. generic tuning proposal).
   */
  readonly synthesis: ArgusSynthesisResponse | null;
  readonly backtest: ArgusMutationDetailBacktest | null;
  readonly outcome: ArgusMutationDetailOutcome | null;
  readonly actor: ArgusMutationDetailActor;
  readonly advisory: ArgusMutationDetailAdvisory | null;
  readonly audit: ArgusMutationDetailAudit;
  /**
   * Tier 2 — pattern seed + procedure clusters pulled off
   * `argus.pattern_id` / `argus.procedure_clusters`. `null` when the
   * intent predates Tier 2 (i.e. neither field is present on the doc).
   */
  readonly pattern_seed: ArgusMutationDetailPatternSeed | null;
  /**
   * Tier 2 — coverage delta pulled off `argus.coverage_delta`. `null`
   * when the intent predates Tier 2 or the synthesizer could not score
   * a delta (no snapshot available).
   */
  readonly coverage_delta: ArgusMutationDetailCoverageDelta | null;
}

export type ArgusMutationDetailReasonCode = 'ok' | 'not_found';

export interface ArgusMutationDetailResponse {
  readonly reason_code: ArgusMutationDetailReasonCode;
  readonly detail: ArgusMutationDetail | null;
}
