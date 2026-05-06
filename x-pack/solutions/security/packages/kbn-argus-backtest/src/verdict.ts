/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * ARGUS R8 — pure TypeScript spec for the rule-backtester verdict
 * classifier and the downstream mutation-intent status transition.
 *
 * The authoritative runtime implementation is Liquid inside
 * `soc-simulation/workflows/soc_rule_backtester.yaml`. This module is
 * the spec: it's unit-tested and the YAML MUST mirror it. Any change
 * to the matrix on one side must be made on the other in the same
 * commit, or the `verdict.spec_alignment.test.ts` drift detector will
 * fail.
 *
 * R8 invariant: "every auto_apply goes through a dry-run" —
 *   - The applier (`soc_autonomous_applier.yaml`) refuses rule-update
 *     intents that lack a backtest_verdict.
 *   - The backtester is the ONLY producer of `backtest_verdict`.
 *   - `flipIntentStatus(v)` is the sole transition function from a
 *     verdict to the intent's next status; the applier then reads
 *     that status.
 */

export type RuleAction =
  | 'raise_threshold'
  | 'lower_threshold'
  | 'tighten_query'
  | 'broaden_query'
  | 'disable'
  | 'enable'
  | 'change_severity'
  | 'change_risk_score'
  | 'add_note';

export type RuleOp = 'create' | 'update' | 'delete';

export type BacktestVerdict = 'projection_safe' | 'projection_concerning' | 'projection_unknown';

export type MutationIntentStatus =
  | 'auto_apply_ready'
  | 'pending_review'
  | 'rejected_backtest'
  | 'pending';

export interface BacktestInput {
  /** Rule mutation operation. */
  op: RuleOp;
  /** Action for `update` ops. Ignored for `create` / `delete`. */
  action?: RuleAction;
  /** Confirmed true-positive correlations touching this rule in the backtest window. */
  tp_correlations: number;
  /** Historical alert count from this rule in the backtest window. */
  alert_count: number;
  /**
   * For `create`: projected alert count if the new rule had existed for
   * the window. Ignored otherwise.
   */
  projected_create_hits?: number;
}

export interface BacktestClassification {
  verdict: BacktestVerdict;
  verdict_reason: string;
  /** The next status the applier should see on the mutation intent. */
  next_status: MutationIntentStatus;
}

/**
 * Thresholds for `rule_create` dry-run classification. Intentionally
 * conservative — a new rule that would have fired > NOISY_CREATE_THRESHOLD
 * alerts over the 30-day window is routed to human review rather than
 * auto-applied. This is the R8 invariant for create-path autonomy.
 */
export const CREATE_HIT_THRESHOLDS = Object.freeze({
  /** <= silent: no historical hits — either the rule is for future activity or the backtest is too narrow; unknown is safer than safe. */
  silent: 0,
  /** <= safe: historical hits within expected-alert volume. */
  safe: 20,
  /** > safe → concerning (noisy rule). */
} as const);

/**
 * Classify a proposed mutation based on the backtest window stats and the
 * mutation's op / action. Pure, deterministic, side-effect-free.
 */
export const classifyBacktest = (input: BacktestInput): BacktestClassification => {
  // DELETE — destructive. Always route through human review. The
  // backtester never auto-applies a delete, so the verdict is always
  // "concerning" regardless of stats.
  if (input.op === 'delete') {
    return {
      verdict: 'projection_concerning',
      verdict_reason: 'rule_delete is destructive and always requires human approval',
      next_status: 'pending_review',
    };
  }

  // CREATE — dry-run: project alert count from the draft rule query
  // against the historical window. Safe if <= CREATE_HIT_THRESHOLDS.safe,
  // unknown if zero (likely future-facing rule), concerning if noisy.
  if (input.op === 'create') {
    const hits = input.projected_create_hits ?? -1;
    if (hits < 0) {
      return {
        verdict: 'projection_unknown',
        verdict_reason:
          'create dry-run missing projected_create_hits — backtester skipped the projection',
        next_status: 'pending_review',
      };
    }
    if (hits <= CREATE_HIT_THRESHOLDS.silent) {
      return {
        verdict: 'projection_unknown',
        verdict_reason: `create dry-run projected 0 hits over the backtest window; cannot verify rule fires at all`,
        next_status: 'pending_review',
      };
    }
    if (hits <= CREATE_HIT_THRESHOLDS.safe) {
      return {
        verdict: 'projection_safe',
        verdict_reason: `create dry-run projected ${hits} alerts over the backtest window, within the <= ${CREATE_HIT_THRESHOLDS.safe} safe threshold`,
        next_status: 'auto_apply_ready',
      };
    }
    return {
      verdict: 'projection_concerning',
      verdict_reason: `create dry-run projected ${hits} alerts over the backtest window; exceeds the safe threshold of ${CREATE_HIT_THRESHOLDS.safe}`,
      next_status: 'pending_review',
    };
  }

  // UPDATE — action-dependent. Mirrors the Liquid in soc_rule_backtester.yaml.
  const action = input.action;
  if (!action) {
    return {
      verdict: 'projection_unknown',
      verdict_reason: 'update intent missing action field',
      next_status: 'pending_review',
    };
  }

  // Non-match-affecting actions: never change match behavior, so the
  // historical TP count is irrelevant.
  if (action === 'change_severity' || action === 'change_risk_score' || action === 'add_note') {
    return {
      verdict: 'projection_safe',
      verdict_reason: `action=${action} does not affect rule matching`,
      next_status: 'auto_apply_ready',
    };
  }

  // `enable` re-activates a rule; we don't know its historical fidelity.
  if (action === 'enable') {
    return {
      verdict: 'projection_unknown',
      verdict_reason: 'action=enable has no historical projection signal',
      next_status: 'pending_review',
    };
  }

  // `disable` is safe iff no TP in window.
  if (action === 'disable') {
    if (input.tp_correlations === 0) {
      return {
        verdict: 'projection_safe',
        verdict_reason: 'action=disable with 0 TP correlations in window is reversible and safe',
        next_status: 'auto_apply_ready',
      };
    }
    return {
      verdict: 'projection_concerning',
      verdict_reason: `action=disable would suppress ${input.tp_correlations} confirmed TP correlation(s)`,
      next_status: 'pending_review',
    };
  }

  // `raise_threshold` is safe iff no TP in window (raise can mute TPs).
  if (action === 'raise_threshold') {
    if (input.tp_correlations === 0) {
      return {
        verdict: 'projection_safe',
        verdict_reason:
          'action=raise_threshold with 0 TP correlations in window cannot have muted a real case',
        next_status: 'auto_apply_ready',
      };
    }
    return {
      verdict: 'projection_concerning',
      verdict_reason: `action=raise_threshold may have suppressed ${input.tp_correlations} TP correlation(s) in window`,
      next_status: 'pending_review',
    };
  }

  // All other query-shape changes are concerning by default.
  return {
    verdict: 'projection_concerning',
    verdict_reason: `action=${action} is a query-shape change; requires human eyeball`,
    next_status: 'pending_review',
  };
};

/**
 * Map a verdict to the next status. Convenience wrapper that reuses
 * `classifyBacktest`. Exposed separately because the applier YAML needs
 * a one-arg function it can call with just the verdict.
 */
export const flipIntentStatus = (verdict: BacktestVerdict): MutationIntentStatus => {
  switch (verdict) {
    case 'projection_safe':
      return 'auto_apply_ready';
    case 'projection_concerning':
      return 'pending_review';
    case 'projection_unknown':
      return 'pending_review';
  }
};
