/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Closed set of time-windows the Autonomy feed supports. Aligned with the
 * Mutations tab toggle so operators see the same "24h / 7d" anchor across
 * the console.
 */
export type ArgusAutonomyWindow = '24h' | '7d';

/**
 * Final disposition of a governance decision. Mirrors the `final_status`
 * field emitted by `soc-autonomous-applier.yaml` and `soc-rule-backtester.yaml`.
 */
export type ArgusAutonomyFinalStatus =
  | 'auto_applied'
  | 'deferred'
  | 'required_human'
  | 'rejected'
  | 'rolled_back'
  | 'unknown';

/**
 * One row on the Autonomy tab. Every field is optional except the identifying
 * triple (`timestamp`, `artifact_id`, `final_status`) — some producers omit
 * gate metadata or trust fields.
 */
export interface ArgusAutonomyDecision {
  readonly id: string;
  readonly timestamp: string;
  readonly rec_id?: string;
  readonly artifact_type?: string;
  readonly artifact_id: string;
  /**
   * Kibana saved-object id of the detection rule this decision produced,
   * when the route was able to resolve `artifact_id` → a real rule via
   * the alerting rules client. Absent when the artifact is not a rule, or
   * when no rule with that logical id exists in this space (e.g. demo
   * `argus.*` ids that were never applied as Kibana rules). The UI uses
   * this to deep-link into the rule details page.
   *
   * Populated for both `artifact_type: "rule"` (Argus-authored custom rules)
   * and `artifact_type: "prebuilt_rule"` (Elastic prebuilt rules Argus
   * autonomously enabled). The deep-link behaviour is identical — prebuilt
   * rules are still Kibana detection rules, just `immutable: true`.
   */
  readonly kibana_rule_id?: string;
  /**
   * Human-readable name of the resolved detection rule. Surfaced as the
   * primary artifact label so operators don't have to recognise bare
   * UUIDs (especially important for prebuilt rules, whose `artifact_id`
   * is the logical rule_id assigned by Elastic's prebuilt package).
   * Absent when `kibana_rule_id` is absent.
   */
  readonly kibana_rule_name?: string;
  readonly action?: string;
  readonly source_agent?: string;
  readonly source_workflow?: string;
  readonly gates_evaluated?: readonly string[];
  readonly gates_passed?: readonly string[];
  readonly first_failing_gate?: string;
  /**
   * Semantic bucket the UI groups by. Derived from `raw_final_status` +
   * the `auto_applied`/`required_human` boolean flags — producers may emit
   * finer-grained statuses (e.g. `pending_backtest`, `regression_detected`)
   * which we fold into one of these five buckets.
   */
  readonly final_status: ArgusAutonomyFinalStatus;
  /**
   * Verbatim `final_status` string as written by the producer workflow.
   * Surfaced on the row so operators can see producer fidelity without
   * losing the semantic grouping.
   */
  readonly raw_final_status?: string;
  readonly auto_applied?: boolean;
  readonly required_human?: boolean;
  readonly review_reason?: string;
  readonly trust_tier?: string;
  readonly trust_score?: number;
  readonly backtest_verdict?: string;
  readonly backtest_ref?: string;
  readonly confidence?: number;
  readonly decision_duration_ms?: number;
}

export interface ArgusAutonomyCounts {
  readonly total: number;
  readonly auto_applied: number;
  readonly deferred: number;
  readonly required_human: number;
  readonly rejected: number;
  readonly rolled_back: number;
}

export interface ArgusAutonomyResponse {
  readonly window_start: string;
  readonly window_end: string;
  readonly decisions: readonly ArgusAutonomyDecision[];
  readonly counts: ArgusAutonomyCounts;
  readonly truncated: boolean;
}
