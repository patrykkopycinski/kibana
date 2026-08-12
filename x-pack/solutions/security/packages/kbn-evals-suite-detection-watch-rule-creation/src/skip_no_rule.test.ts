/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createFieldCoverageEvaluator,
  createSeverityValidityEvaluator,
  createApprovalGateEvaluator,
} from './evaluate_dataset';

/**
 * `skipNoRule` semantics.
 *
 * Eleven of the thirteen evaluators are wrapped in `skipNoRule`, which turns "the workflow produced
 * no rule" into `score: null` / `N/A` rather than 0. That is the right call for *quality* metrics —
 * grading the severity of a rule that does not exist is meaningless, and a 0 would drag the average
 * down in a way that reads as "wrote a bad rule" rather than "wrote nothing".
 *
 * But it has teeth, because null scores are dropped from `extended_stats` rather than counted as 0
 * (the same property that let a fully broken trace pipeline report "2 passed"). A total workflow
 * failure therefore scores as *nothing*, not as failure, on every wrapped metric. What stops that
 * from reading as a clean run is that the two unwrapped evaluators still score it:
 *
 *   - Approval Gate, which must be able to *fail* a run that never drafted a rule, and
 *   - Tool Routing, which reports the agent never called the rule-creation tool.
 *
 * The asymmetry is deliberate and load-bearing, so it is pinned here: if someone later wraps the
 * approval gate "for consistency", a no-rule run becomes all-N/A and silently unfailable.
 */

const noRule = { output: {} } as never;

describe('skipNoRule', () => {
  it('returns N/A rather than 0 for quality evaluators when no rule was produced', async () => {
    const result = await createFieldCoverageEvaluator().evaluate(noRule);

    // null, not 0: a missing rule is unmeasured, not badly measured.
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('applies to every wrapped quality evaluator, not just one', async () => {
    const result = await createSeverityValidityEvaluator().evaluate(noRule);

    expect(result.score).toBeNull();
  });

  it('does NOT skip the approval gate — a no-rule run must stay judgeable', async () => {
    // The safety gate is deliberately unwrapped. If this ever returns N/A, a run that produced
    // nothing becomes incapable of failing the kill criterion.
    const result = await createApprovalGateEvaluator().evaluate(noRule);

    expect(result.score).not.toBeNull();
    expect(result.label).not.toBe('N/A');
  });
});
