/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERTZERO_LEAN_TOKEN_BUDGET_PROFILE,
  DEFAULT_TOKEN_BUDGET_PROFILE,
  resolveTokenBudgetProfile,
} from './token_budget_profile';

describe('resolveTokenBudgetProfile', () => {
  const thin = 'alertzero-thin-agent';

  it('the lean profile is strictly tighter than the default on every knob', () => {
    const lean = ALERTZERO_LEAN_TOKEN_BUDGET_PROFILE;
    const base = DEFAULT_TOKEN_BUDGET_PROFILE;
    expect(lean.maxToolResultTokens).toBeLessThan(base.maxToolResultTokens);
    expect(lean.substitution.roundStartCold).toBeLessThan(base.substitution.roundStartCold);
    expect(lean.substitution.roundStartHot).toBeLessThan(base.substitution.roundStartHot);
    expect(lean.substitution.intraRound).toBeLessThan(base.substitution.intraRound);
  });

  it.each([['detection-coverage'], ['detection-rule-edit'], ['investigate-rule']])(
    'uses the lean profile for the thin agent with %s',
    (skill) => {
      expect(
        resolveTokenBudgetProfile({
          agentId: thin,
          configurationOverrides: { skill_ids: [skill, 'find-security-rules'] },
        })
      ).toBe(ALERTZERO_LEAN_TOKEN_BUDGET_PROFILE);
    }
  );

  it.each([
    ['other thin-agent skill', thin, { skill_ids: ['endpoint-forensic-analysis'] }],
    ['no overrides', thin, undefined],
    ['other agent', 'elastic-ai-agent', { skill_ids: ['detection-coverage'] }],
    ['no agent id', undefined, { skill_ids: ['detection-coverage'] }],
  ])('keeps the default profile: %s', (_name, agentId, configurationOverrides) => {
    expect(resolveTokenBudgetProfile({ agentId, configurationOverrides })).toBe(
      DEFAULT_TOKEN_BUDGET_PROFILE
    );
  });
});
