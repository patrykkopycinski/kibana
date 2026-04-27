/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface LocalTierConfig {
  alwaysRunEvaluators: string[];
  optionalLlmEvaluators: string[];
  thresholdMultiplier: number;
  maxSamplesPerExperiment: number;
  taskTimeoutMs: number;
}

const CODE_EVALUATORS = [
  'similarity',
  'prompt-leak-detection',
  'tool-poisoning',
  'scope-violation',
  'latency',
  'tokens',
  'skill_invocation',
  'tool_calls',
];

const LLM_EVALUATORS = [
  'criteria',
  'correctness',
  'Factuality',
  'Relevance',
  'conversation_coherence',
  'attack-success-judge',
];

export const LOCAL_TIER: LocalTierConfig = {
  alwaysRunEvaluators: CODE_EVALUATORS,
  optionalLlmEvaluators: LLM_EVALUATORS,
  thresholdMultiplier: 0.8,
  maxSamplesPerExperiment: 10,
  taskTimeoutMs: 120_000,
};

/**
 * Return the list of evaluators to run based on whether LLM-as-judge evaluators are available.
 */
export function getSelectedEvaluators(codeOnly: boolean): string[] {
  if (codeOnly) {
    return [...LOCAL_TIER.alwaysRunEvaluators];
  }
  return [...LOCAL_TIER.alwaysRunEvaluators, ...LOCAL_TIER.optionalLlmEvaluators];
}

/**
 * Environment variables to inject for tier-aware eval execution.
 */
export function setTierEnv(codeOnly: boolean): void {
  const evaluators = getSelectedEvaluators(codeOnly);
  process.env.SELECTED_EVALUATORS = evaluators.join(',');
  process.env.EVAL_TIER = 'local';
  process.env.EVAL_THRESHOLD_MULTIPLIER = String(LOCAL_TIER.thresholdMultiplier);
  process.env.EVAL_MAX_SAMPLES = String(LOCAL_TIER.maxSamplesPerExperiment);
  process.env.EVAL_TASK_TIMEOUT_MS = String(LOCAL_TIER.taskTimeoutMs);
}
