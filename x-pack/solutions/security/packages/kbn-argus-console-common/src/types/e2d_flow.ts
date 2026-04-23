/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Narrative-grade "CVE -> detection rule running" flow. Unlike `MutationLineage`
 * (which is a graph optimised for the SVG renderer), this type is shaped for
 * a vertical timeline UI: each stage carries rich per-stage fields that let
 * the panel render status badges, metrics, and deep-link targets without
 * having to re-query any indices client-side.
 */

export type ArgusE2dStageKind =
  | 'ingested'
  | 'exploit_probability'
  | 'synthesized'
  | 'evaluated'
  | 'backtested'
  | 'governance'
  | 'applied'
  | 'running';

export type ArgusE2dStageStatus = 'done' | 'pending' | 'skipped' | 'blocked' | 'failed';

export interface ArgusE2dStageBase {
  readonly kind: ArgusE2dStageKind;
  readonly status: ArgusE2dStageStatus;
  readonly title: string;
  readonly subtitle?: string;
  readonly timestamp?: string;
  /**
   * Elasticsearch doc that backs this stage. UI uses these to render an
   * "open in Discover" link.
   */
  readonly source_doc_id?: string;
  readonly source_index?: string;
}

export interface ArgusE2dIngestedStage extends ArgusE2dStageBase {
  readonly kind: 'ingested';
  readonly cve_id: string | null;
  readonly advisory_id: string | null;
  readonly severity: string | null;
  readonly kev: boolean;
  readonly mitre_techniques: readonly string[];
  readonly source: string | null;
}

export interface ArgusE2dExploitProbabilityStage extends ArgusE2dStageBase {
  readonly kind: 'exploit_probability';
  readonly score: number | null;
  readonly kev: boolean;
}

export interface ArgusE2dSynthesizedStage extends ArgusE2dStageBase {
  readonly kind: 'synthesized';
  readonly draft_rule_id: string | null;
  readonly mutation_intent_id: string | null;
  readonly recommendation_id: string | null;
  readonly corpus_id: string | null;
}

export interface ArgusE2dEvaluatedStage extends ArgusE2dStageBase {
  readonly kind: 'evaluated';
  readonly precision: number | null;
  readonly recall: number | null;
  readonly fp_rate_baseline: number | null;
  readonly variant_coverage: number | null;
  readonly gate_decision: string | null;
  readonly gate_reason: string | null;
}

export interface ArgusE2dBacktestedStage extends ArgusE2dStageBase {
  readonly kind: 'backtested';
  readonly windows_tested: number | null;
  readonly true_positives: number | null;
  readonly false_positives: number | null;
  readonly gate_decision: string | null;
}

export interface ArgusE2dGovernanceStage extends ArgusE2dStageBase {
  readonly kind: 'governance';
  readonly gate_status: string | null;
  readonly trust_tier: string | null;
  readonly blocked_reason: string | null;
}

export interface ArgusE2dAppliedStage extends ArgusE2dStageBase {
  readonly kind: 'applied';
  readonly rule_id: string | null;
  readonly rolled_back: boolean;
  readonly rollback_mttr_ms: number | null;
  readonly applied_at: string | null;
}

export interface ArgusE2dRunningStage extends ArgusE2dStageBase {
  readonly kind: 'running';
  readonly rule_id: string | null;
  readonly live_hits: number;
  readonly live_hits_window: '24h' | '7d';
  readonly is_live: boolean;
}

export type ArgusE2dStage =
  | ArgusE2dIngestedStage
  | ArgusE2dExploitProbabilityStage
  | ArgusE2dSynthesizedStage
  | ArgusE2dEvaluatedStage
  | ArgusE2dBacktestedStage
  | ArgusE2dGovernanceStage
  | ArgusE2dAppliedStage
  | ArgusE2dRunningStage;

export type ArgusE2dOverallStatus =
  | 'ingested'
  | 'synthesized'
  | 'evaluated'
  | 'backtested'
  | 'approved'
  | 'blocked'
  | 'applied'
  | 'running'
  | 'rolled_back';

export interface ArgusE2dFlowPayload {
  readonly cve_id: string | null;
  readonly advisory_id: string | null;
  readonly title: string | null;
  readonly overall_status: ArgusE2dOverallStatus;
  readonly stages: readonly ArgusE2dStage[];
  readonly live_hits_window: '24h' | '7d';
}

export type ArgusE2dReasonCode = 'ok' | 'not_found';

export interface ArgusE2dFlowResponse {
  readonly reason_code: ArgusE2dReasonCode;
  readonly flow?: ArgusE2dFlowPayload;
  readonly query: {
    readonly cve: string;
    readonly window: '24h' | '7d';
  };
}

export interface ArgusE2dRecentCve {
  readonly advisory_id: string;
  readonly cve_id: string | null;
  readonly title: string | null;
  readonly severity: string | null;
  readonly status: string | null;
  readonly kev: boolean;
  readonly ingested_at: string | null;
  readonly draft_rule_id: string | null;
  readonly has_mutation_intent: boolean;
}

export interface ArgusE2dRecentCvesResponse {
  readonly items: readonly ArgusE2dRecentCve[];
  readonly kev_only: boolean;
  readonly truncated: boolean;
}
