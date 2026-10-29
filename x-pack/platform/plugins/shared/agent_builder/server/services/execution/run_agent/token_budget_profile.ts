/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuntimeAgentConfigurationOverrides } from '@kbn/agent-builder-common';
import {
  SUBST_INTRA_ROUND_THRESHOLD,
  SUBST_ROUND_START_THRESHOLD_COLD,
  SUBST_ROUND_START_THRESHOLD_HOT,
} from './constants';
import { DEFAULT_MAX_TOOL_RESULT_TOKENS } from './utils/tool_result_guardrail';

/**
 * Per-run knobs that bound how much tool output stays in the prompt.
 */
export interface TokenBudgetProfile {
  /** Max agent cycles before the run is forced to answer. */
  cycleLimit: number;
  /** Cap on one tool call's result, in tokens. */
  maxToolResultTokens: number;
  /** Filestore-entry size above which a result is replaced by a pointer. */
  substitution: {
    roundStartCold: number;
    roundStartHot: number;
    intraRound: number;
  };
}

/** Max number of agent cycles allowed before forcing an answer (the default for every agent). */
export const DEFAULT_CYCLE_LIMIT = 30;

export const DEFAULT_TOKEN_BUDGET_PROFILE: TokenBudgetProfile = {
  cycleLimit: DEFAULT_CYCLE_LIMIT,
  maxToolResultTokens: DEFAULT_MAX_TOOL_RESULT_TOKENS,
  substitution: {
    roundStartCold: SUBST_ROUND_START_THRESHOLD_COLD,
    roundStartHot: SUBST_ROUND_START_THRESHOLD_HOT,
    intraRound: SUBST_INTRA_ROUND_THRESHOLD,
  },
};

/**
 * Lean profile for the AlertZero detection workflows (coverage review, rule tuning review,
 * rule creation).
 *
 * Measured per-call prompt sizes on those workflows (input tokens):
 *   - Luna   (eis-openai-gpt-5-6-luna):       median 20.6K, max 62.4K
 *   - Sonnet (eis-anthropic-claude-5-sonnet): median 36.3K, max 93.1K
 * A single 20K tool result is therefore as large as Luna's whole median prompt, and the prompt
 * grows by every accumulated result on each later call. Output is under 1% of tokens, so only
 * input-side limits matter. The values below cap one result at 8K tokens and substitute results
 * earlier (a result over 2K is replaced by a pointer once it is no longer among the two most
 * recent cycles, and from the start of a hot round) so history stops being re-sent in full.
 */
export const ALERTZERO_MAX_TOOL_RESULT_TOKENS = 8_000;
export const ALERTZERO_SUBST_ROUND_START_THRESHOLD_COLD = 500;
export const ALERTZERO_SUBST_ROUND_START_THRESHOLD_HOT = 2_000;
export const ALERTZERO_SUBST_INTRA_ROUND_THRESHOLD = 500;

/**
 * Per-run cycle budget for the AlertZero detection workflows. Every extra cycle re-sends the whole
 * accumulated prompt (median 20.6K-36.3K tokens, see above), so a runaway search loop costs
 * quadratically. 20 leaves headroom over the three-search coverage procedure plus verdict; lower it
 * only after the cycle histogram of the measurement runs shows the p95.
 */
export const ALERTZERO_CYCLE_LIMIT = 20;

export const ALERTZERO_LEAN_TOKEN_BUDGET_PROFILE: TokenBudgetProfile = {
  cycleLimit: ALERTZERO_CYCLE_LIMIT,
  maxToolResultTokens: ALERTZERO_MAX_TOOL_RESULT_TOKENS,
  substitution: {
    roundStartCold: ALERTZERO_SUBST_ROUND_START_THRESHOLD_COLD,
    roundStartHot: ALERTZERO_SUBST_ROUND_START_THRESHOLD_HOT,
    intraRound: ALERTZERO_SUBST_INTRA_ROUND_THRESHOLD,
  },
};

/** The shared thin agent every AlertZero workflow step runs on (kbn-alertzero-common). */
const ALERTZERO_THIN_AGENT_ID = 'alertzero-thin-agent';

/**
 * Skills pinned by the AlertZero coverage review (`detection-coverage`), rule creation
 * (`detection-rule-edit`) and rule tuning review (`investigate-rule`) workflow steps. The lean
 * profile applies only when the step runs on the thin agent AND selects one of them, so the
 * thin agent's other workflows (attack discovery, forensics) and every other agent keep the
 * defaults.
 */
const ALERTZERO_LEAN_SKILL_IDS: ReadonlySet<string> = new Set([
  'detection-coverage',
  'detection-rule-edit',
  'investigate-rule',
]);

export const resolveTokenBudgetProfile = ({
  agentId,
  configurationOverrides,
}: {
  agentId?: string;
  configurationOverrides?: RuntimeAgentConfigurationOverrides;
}): TokenBudgetProfile => {
  if (
    agentId === ALERTZERO_THIN_AGENT_ID &&
    configurationOverrides?.skill_ids?.some((id) => ALERTZERO_LEAN_SKILL_IDS.has(id))
  ) {
    return ALERTZERO_LEAN_TOKEN_BUDGET_PROFILE;
  }
  return DEFAULT_TOKEN_BUDGET_PROFILE;
};
