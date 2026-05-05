/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DEFAULT_SKILL_HEALTH_THRESHOLDS,
  evaluateSkillHealth,
  resolveSkillHealthThresholds,
} from './skill_health';

describe('resolveSkillHealthThresholds', () => {
  it('returns defaults when overrides are not provided', () => {
    expect(resolveSkillHealthThresholds()).toEqual(DEFAULT_SKILL_HEALTH_THRESHOLDS);
    expect(resolveSkillHealthThresholds(null)).toEqual(DEFAULT_SKILL_HEALTH_THRESHOLDS);
    expect(resolveSkillHealthThresholds({})).toEqual(DEFAULT_SKILL_HEALTH_THRESHOLDS);
  });

  it('applies provided overrides on top of defaults', () => {
    expect(
      resolveSkillHealthThresholds({
        min_invocations_for_verdict: 10,
        success_rate_floor_review: 0.8,
      })
    ).toEqual({
      ...DEFAULT_SKILL_HEALTH_THRESHOLDS,
      min_invocations_for_verdict: 10,
      success_rate_floor_review: 0.8,
    });
  });

  it('drops negative and non-finite override values', () => {
    expect(
      resolveSkillHealthThresholds({
        min_invocations_for_verdict: -10,
        success_rate_floor_demote: Number.NaN,
        success_rate_floor_review: Number.POSITIVE_INFINITY,
      })
    ).toEqual(DEFAULT_SKILL_HEALTH_THRESHOLDS);
  });

  it('clamps inverted floors so demote <= review always holds', () => {
    // Operator passes demote > review by mistake. Resolver must repair the
    // invariant rather than silently accepting an inverted matrix.
    const result = resolveSkillHealthThresholds({
      success_rate_floor_demote: 0.9,
      success_rate_floor_review: 0.5,
    });
    expect(result.success_rate_floor_demote).toBe(0.9);
    expect(result.success_rate_floor_review).toBe(0.9);
  });

  it('accepts zero as a valid override (no minimum invocations required)', () => {
    const result = resolveSkillHealthThresholds({ min_invocations_for_verdict: 0 });
    expect(result.min_invocations_for_verdict).toBe(0);
  });
});

describe('evaluateSkillHealth', () => {
  it('returns insufficient_data when invocation volume is below the threshold', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.assess_cve',
        invocations_7d: 2,
        success_count_7d: 1,
        failure_count_7d: 1,
        success_rate_7d: 0.5,
      },
    });

    expect(result.verdict).toBe('insufficient_data');
    expect(result.recommended_actions).toEqual(['log_only']);
    expect(result.reasons[0]).toContain('below min_invocations_for_verdict=5');
  });

  it('returns healthy when success_rate_7d clears the review floor', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.assess_cve',
        invocations_7d: 20,
        success_count_7d: 19,
        failure_count_7d: 1,
        success_rate_7d: 0.95,
        last_run_ts: '2026-04-20T12:00:00.000Z',
      },
    });

    expect(result.verdict).toBe('healthy');
    expect(result.recommended_actions).toEqual(['log_only']);
    expect(result.metrics_snapshot.success_rate_7d).toBe(0.95);
    expect(result.metrics_snapshot.last_run_ts).toBe('2026-04-20T12:00:00.000Z');
  });

  it('returns review when between floors with low absolute failure volume', () => {
    // 20 invocations, 13 success, 4 failure → 13/(13+4)=0.7647... but the
    // input rate is 0.65 which is between the two floors. Failures are below
    // min_failures_for_reprompt → review only.
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.detect_response_action',
        invocations_7d: 17,
        success_count_7d: 11,
        failure_count_7d: 4,
        success_rate_7d: 0.65,
      },
      thresholds: { min_failures_for_reprompt: 10 },
    });

    expect(result.verdict).toBe('review');
    expect(result.recommended_actions).toEqual(['open_review_case']);
  });

  it('returns reprompt when between floors with enough failure volume to justify a prompt edit', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.summarize_alert',
        invocations_7d: 30,
        success_count_7d: 19,
        failure_count_7d: 11,
        success_rate_7d: 0.6333,
      },
    });

    expect(result.verdict).toBe('reprompt');
    expect(result.recommended_actions).toEqual(['reprompt_skill', 'open_review_case']);
  });

  it('returns demote when the rate is at or below the demote floor with enough failures', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.flaky_skill',
        invocations_7d: 50,
        success_count_7d: 20,
        failure_count_7d: 30,
        success_rate_7d: 0.4,
      },
    });

    expect(result.verdict).toBe('demote');
    expect(result.recommended_actions).toEqual(['demote_actor', 'open_review_case']);
  });

  it('downgrades demote to review when the rate is below the floor but failure count is thin', () => {
    // 6 invocations, 2 success, 4 failure — rate 0.33 (below demote floor)
    // but only 4 failures, which is below default min_failures_for_reprompt=5.
    // Surface for review rather than demoting on thin volume.
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.new_skill',
        invocations_7d: 6,
        success_count_7d: 2,
        failure_count_7d: 4,
        success_rate_7d: 0.3333,
      },
    });

    expect(result.verdict).toBe('review');
    expect(result.recommended_actions).toEqual(['open_review_case']);
    expect(result.reasons[0]).toContain('failures=4 < min_failures_for_reprompt=5');
  });

  it('derives success_rate from counts when the input field is missing', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.assess_cve',
        invocations_7d: 20,
        success_count_7d: 18,
        failure_count_7d: 2,
        // No success_rate_7d field
      },
    });

    expect(result.metrics_snapshot.success_rate_7d).toBe(0.9);
    expect(result.verdict).toBe('healthy');
  });

  it('derives success_rate from counts when the input field is non-finite', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.assess_cve',
        invocations_7d: 10,
        success_count_7d: 9,
        failure_count_7d: 1,
        success_rate_7d: Number.NaN,
      },
    });

    expect(result.metrics_snapshot.success_rate_7d).toBe(0.9);
    expect(result.verdict).toBe('healthy');
  });

  it('clamps success_rate to [0, 1] when the input field is out of range', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.misconfigured',
        invocations_7d: 10,
        success_count_7d: 8,
        failure_count_7d: 2,
        // Bug: a producer wrote success_rate_7d as a percentage (80) instead
        // of a fraction (0.8). The evaluator clamps to 1.0 so the verdict
        // matrix doesn't crash on a "120% success rate" outlier.
        success_rate_7d: 80,
      },
    });

    expect(result.metrics_snapshot.success_rate_7d).toBe(1);
    expect(result.verdict).toBe('healthy');
  });

  it('coerces negative or non-finite count fields to zero', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.bad_data',
        invocations_7d: -5,
        success_count_7d: Number.NEGATIVE_INFINITY,
        failure_count_7d: 3,
      },
    });

    expect(result.metrics_snapshot).toEqual({
      invocations_7d: 0,
      success_count_7d: 0,
      failure_count_7d: 3,
      success_rate_7d: 0,
      last_run_ts: null,
    });
    expect(result.verdict).toBe('insufficient_data');
  });

  it('floors fractional count fields to integers', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.fractional_input',
        invocations_7d: 10.7,
        success_count_7d: 8.9,
        failure_count_7d: 1.2,
        success_rate_7d: 0.89,
      },
    });

    expect(result.metrics_snapshot.invocations_7d).toBe(10);
    expect(result.metrics_snapshot.success_count_7d).toBe(8);
    expect(result.metrics_snapshot.failure_count_7d).toBe(1);
  });

  it('stamps the resolved thresholds onto the recommendation for audit', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.assess_cve',
        invocations_7d: 100,
        success_count_7d: 60,
        failure_count_7d: 40,
        success_rate_7d: 0.6,
      },
      thresholds: {
        min_invocations_for_verdict: 50,
        success_rate_floor_review: 0.8,
      },
    });

    expect(result.thresholds_applied).toEqual({
      ...DEFAULT_SKILL_HEALTH_THRESHOLDS,
      min_invocations_for_verdict: 50,
      success_rate_floor_review: 0.8,
    });
  });

  it('preserves skill_id verbatim on the recommendation', () => {
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.namespaced.skill_id-1',
        invocations_7d: 0,
      },
    });

    expect(result.skill_id).toBe('argus.namespaced.skill_id-1');
  });

  it('is deterministic — same metrics produce same verdict matrix output', () => {
    const metrics = {
      skill_id: 'argus.deterministic',
      invocations_7d: 30,
      success_count_7d: 20,
      failure_count_7d: 10,
      success_rate_7d: 0.6667,
    };
    const r1 = evaluateSkillHealth({ metrics });
    const r2 = evaluateSkillHealth({ metrics });
    expect(r1).toEqual(r2);
  });

  it('treats edge-case rates exactly at the demote floor as demote-eligible', () => {
    // Rate exactly 0.5 with 5 failures → demote (boundary inclusive on the
    // demote side). The matrix uses `<= floor_demote` so 0.5 is demote.
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.boundary',
        invocations_7d: 10,
        success_count_7d: 5,
        failure_count_7d: 5,
        success_rate_7d: 0.5,
      },
    });
    expect(result.verdict).toBe('demote');
  });

  it('treats edge-case rates exactly at the review floor as review-eligible (not healthy)', () => {
    // Rate exactly 0.7 → review (boundary inclusive on the review side).
    // The matrix uses `<= floor_review` so 0.7 is still in the review band.
    const result = evaluateSkillHealth({
      metrics: {
        skill_id: 'argus.boundary',
        invocations_7d: 10,
        success_count_7d: 7,
        failure_count_7d: 3,
        success_rate_7d: 0.7,
      },
      thresholds: { min_failures_for_reprompt: 10 },
    });
    expect(result.verdict).toBe('review');
  });
});
