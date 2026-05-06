/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * AutoDEX B9 — self-adjusting skills loop.
 *
 * The `soc_skill_metrics_roller` workflow already aggregates per-skill
 * invocation, success, and ROI counts into `.soc-skill-metrics`. Until B9,
 * those metrics fed dashboards but did not feed back into actor / skill
 * governance — there was no closed loop from "skill X is misbehaving" to
 * "actor Y gets demoted" or "skill X gets re-prompted".
 *
 * This module is the pure-logic spec for the verdict matrix. The
 * `soc_skill_self_adjust.yaml` workflow runs the same matrix in Liquid; the
 * MCP-side admission gate (when wired) imports `evaluateSkillHealth`
 * directly. Both surfaces use the same constants so a skill's verdict is
 * the same no matter which transport observes it.
 *
 * The verdict is intentionally conservative — when in doubt, surface to a
 * human review rather than auto-demoting. AutoDEX governance prefers
 * pending_review over irreversible action when signal is thin.
 *
 * See [`B9-skill-self-adjust.md`](../../../../../../soc-simulation/docs/autodex/rfcs/B9-skill-self-adjust.md)
 * for the design and the workflow contract.
 */

/* ------------------------------------------------------------------ */
/* Input — the .soc-skill-metrics row shape                            */
/* ------------------------------------------------------------------ */

/**
 * Snapshot of the per-skill metrics row we evaluate. Field names mirror the
 * `.soc-skill-metrics` index template exactly so a workflow can pass a row
 * straight through `evaluateSkillHealth` after deserialization.
 *
 * `success_rate_7d` is a [0, 1] float; the roller computes it. We keep the
 * field optional and re-derive when missing — defensive against a row
 * upserted by a non-canonical writer.
 */
export interface SkillMetricsSnapshot {
  readonly skill_id: string;
  readonly invocations_7d?: number | null;
  readonly success_count_7d?: number | null;
  readonly failure_count_7d?: number | null;
  readonly success_rate_7d?: number | null;
  readonly last_run_ts?: string | null;
  readonly last_failure_reason?: string | null;
}

/* ------------------------------------------------------------------ */
/* Verdict + thresholds                                                */
/* ------------------------------------------------------------------ */

/**
 * Verdicts in escalating severity:
 *
 *  - `insufficient_data` — too few invocations to evaluate; emits an
 *    informational record, no action.
 *  - `healthy` — success_rate_7d above the review floor. No action required;
 *    record is still emitted so dashboards can show "evaluated" coverage.
 *  - `review` — success_rate_7d between demote and review floors. Surface
 *    to a human; do NOT auto-demote.
 *  - `reprompt` — high invocation volume + sustained failures. Suggest a
 *    skill prompt update before any demotion.
 *  - `demote` — success_rate_7d at or below the demote floor with enough
 *    invocations. Recommends actor demotion (the MCP gate / governance
 *    layer is the authority that actually applies it).
 */
export type SkillHealthVerdict = 'insufficient_data' | 'healthy' | 'review' | 'reprompt' | 'demote';

/**
 * Action recommendations attached to a verdict. The action set is closed
 * (mirrored in the index template's `_meta.actions`) so downstream
 * automations can switch on the strings without parsing free-form text.
 */
export type SkillHealthAction =
  | 'log_only'
  | 'open_review_case'
  | 'reprompt_skill'
  | 'demote_actor'
  | 'freeze_skill';

export interface SkillHealthThresholds {
  /**
   * Minimum invocations_7d before any non-`insufficient_data` verdict is
   * possible. Below this, the loop stays silent rather than demoting on
   * thin signal.
   */
  readonly min_invocations_for_verdict: number;
  /**
   * Success-rate floor (0..1) below which the verdict escalates to
   * `demote`. Default 0.5 — a coin-flip skill is worse than no skill.
   */
  readonly success_rate_floor_demote: number;
  /**
   * Success-rate ceiling (0..1) below which the verdict is at least
   * `review`. Default 0.7 — anything between this and the demote floor is
   * "look at it, but don't act".
   */
  readonly success_rate_floor_review: number;
  /**
   * Minimum invocations_7d *with* a high failure_count (≥ this number of
   * absolute failures over the window) to recommend a reprompt rather than
   * a demote. Below this, the absolute failure count is too small to
   * justify a prompt-edit cycle.
   */
  readonly min_failures_for_reprompt: number;
}

export const DEFAULT_SKILL_HEALTH_THRESHOLDS: SkillHealthThresholds = {
  min_invocations_for_verdict: 5,
  success_rate_floor_demote: 0.5,
  success_rate_floor_review: 0.7,
  min_failures_for_reprompt: 5,
};

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

export interface SkillHealthRecommendation {
  readonly skill_id: string;
  readonly verdict: SkillHealthVerdict;
  readonly reasons: readonly string[];
  readonly recommended_actions: readonly SkillHealthAction[];
  /**
   * The metrics that produced the verdict, normalised — `success_rate_7d`
   * is always a finite number in [0, 1] (re-derived from counts when the
   * input field was missing or non-finite). Surfaces in
   * `.soc-skill-recommendations.metrics_snapshot` for audit.
   */
  readonly metrics_snapshot: {
    readonly invocations_7d: number;
    readonly success_count_7d: number;
    readonly failure_count_7d: number;
    readonly success_rate_7d: number;
    readonly last_run_ts: string | null;
  };
  /**
   * Thresholds applied to produce the verdict. Stamped on the doc so an
   * audit can replay any decision without guessing what the thresholds
   * were that day.
   */
  readonly thresholds_applied: SkillHealthThresholds;
}

/* ------------------------------------------------------------------ */
/* Threshold resolution                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve the effective thresholds: defaults with caller overrides applied
 * on top. Negative or non-finite override values are silently dropped — a
 * malformed override blob can't poison the loop.
 */
export const resolveSkillHealthThresholds = (
  overrides?: Partial<SkillHealthThresholds> | null
): SkillHealthThresholds => {
  const resolved: SkillHealthThresholds = { ...DEFAULT_SKILL_HEALTH_THRESHOLDS };
  if (!overrides) return resolved;

  const apply = (key: keyof SkillHealthThresholds) => {
    const candidate = overrides[key];
    if (candidate === undefined || candidate === null) return;
    if (!Number.isFinite(candidate)) return;
    if (candidate < 0) return;
    (resolved as Record<keyof SkillHealthThresholds, number>)[key] = candidate;
  };

  apply('min_invocations_for_verdict');
  apply('success_rate_floor_demote');
  apply('success_rate_floor_review');
  apply('min_failures_for_reprompt');

  // Defensive: if the operator inverts the floors so demote >= review,
  // the verdict matrix would mis-classify edge cases. Clamp the floors so
  // demote <= review always holds.
  if (resolved.success_rate_floor_demote > resolved.success_rate_floor_review) {
    resolved.success_rate_floor_review = resolved.success_rate_floor_demote;
  }

  return resolved;
};

/* ------------------------------------------------------------------ */
/* The verdict matrix                                                  */
/* ------------------------------------------------------------------ */

export interface EvaluateSkillHealthInput {
  readonly metrics: SkillMetricsSnapshot;
  readonly thresholds?: Partial<SkillHealthThresholds> | null;
}

/**
 * Pure verdict function. Same input → same output. The Liquid mirror in
 * `soc_skill_self_adjust.yaml` MUST stay one-for-one with this matrix;
 * the spec-alignment test in `skill_health.spec_alignment.test.ts` asserts
 * the canonical input set produces the same verdict on both sides.
 */
export const evaluateSkillHealth = ({
  metrics,
  thresholds,
}: EvaluateSkillHealthInput): SkillHealthRecommendation => {
  const applied = resolveSkillHealthThresholds(thresholds);

  const invocations = toNonNegativeInt(metrics.invocations_7d);
  const successes = toNonNegativeInt(metrics.success_count_7d);
  const failures = toNonNegativeInt(metrics.failure_count_7d);

  // Derive success_rate when the input field is missing / non-finite. A
  // (success+failure) total greater than invocations indicates a producer
  // bug — we still compute defensively from the counts.
  const denominator = Math.max(invocations, successes + failures);
  const inputRate = toFiniteRate(metrics.success_rate_7d);
  const derivedRate = denominator > 0 ? successes / denominator : 0;
  const successRate = inputRate ?? derivedRate;

  const baseSnapshot = {
    invocations_7d: invocations,
    success_count_7d: successes,
    failure_count_7d: failures,
    success_rate_7d: clamp01(successRate),
    last_run_ts: metrics.last_run_ts ?? null,
  };

  const reasons: string[] = [];
  let verdict: SkillHealthVerdict;
  let actions: SkillHealthAction[];

  if (invocations < applied.min_invocations_for_verdict) {
    verdict = 'insufficient_data';
    actions = ['log_only'];
    reasons.push(
      `invocations_7d=${invocations} below min_invocations_for_verdict=${applied.min_invocations_for_verdict}`
    );
  } else if (baseSnapshot.success_rate_7d <= applied.success_rate_floor_demote) {
    if (failures >= applied.min_failures_for_reprompt) {
      verdict = 'demote';
      actions = ['demote_actor', 'open_review_case'];
      reasons.push(
        `success_rate_7d=${baseSnapshot.success_rate_7d.toFixed(
          2
        )} <= floor_demote=${applied.success_rate_floor_demote.toFixed(
          2
        )} with ${failures} failures`
      );
    } else {
      // Hit the demote floor but absolute failure count is too small —
      // surface a review rather than demoting on thin volume.
      verdict = 'review';
      actions = ['open_review_case'];
      reasons.push(
        `success_rate_7d=${baseSnapshot.success_rate_7d.toFixed(
          2
        )} <= floor_demote=${applied.success_rate_floor_demote.toFixed(
          2
        )} but failures=${failures} < min_failures_for_reprompt=${
          applied.min_failures_for_reprompt
        }`
      );
    }
  } else if (baseSnapshot.success_rate_7d <= applied.success_rate_floor_review) {
    // Between demote floor and review floor: prefer a reprompt when there
    // is enough absolute failure volume to make a prompt-edit cycle worth
    // the effort; otherwise just open a review.
    if (failures >= applied.min_failures_for_reprompt) {
      verdict = 'reprompt';
      actions = ['reprompt_skill', 'open_review_case'];
      reasons.push(
        `success_rate_7d=${baseSnapshot.success_rate_7d.toFixed(
          2
        )} between [${applied.success_rate_floor_demote.toFixed(
          2
        )}, ${applied.success_rate_floor_review.toFixed(2)}] with ${failures} failures`
      );
    } else {
      verdict = 'review';
      actions = ['open_review_case'];
      reasons.push(
        `success_rate_7d=${baseSnapshot.success_rate_7d.toFixed(
          2
        )} between [${applied.success_rate_floor_demote.toFixed(
          2
        )}, ${applied.success_rate_floor_review.toFixed(
          2
        )}] but failures=${failures} < min_failures_for_reprompt=${
          applied.min_failures_for_reprompt
        }`
      );
    }
  } else {
    verdict = 'healthy';
    actions = ['log_only'];
    reasons.push(
      `success_rate_7d=${baseSnapshot.success_rate_7d.toFixed(
        2
      )} > floor_review=${applied.success_rate_floor_review.toFixed(2)}`
    );
  }

  return {
    skill_id: metrics.skill_id,
    verdict,
    reasons,
    recommended_actions: actions,
    metrics_snapshot: baseSnapshot,
    thresholds_applied: applied,
  };
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const toNonNegativeInt = (value: number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.floor(value);
};

const toFiniteRate = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
};

const clamp01 = (value: number): number => {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};
