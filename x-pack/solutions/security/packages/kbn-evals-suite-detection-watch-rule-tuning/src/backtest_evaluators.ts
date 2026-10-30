/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import { backtestProposal, type BacktestAlerts, type BacktestResult } from './backtest_grader';
import type { RuleTuningVerdict } from './workflow_task';

/** The review verdict plus the alerts the task seeded, which is what the backtest replays over. */
export interface VariantVerdict extends RuleTuningVerdict {
  seededAlerts?: BacktestAlerts;
}

const backtestOf = (output: unknown): BacktestResult => {
  const verdict = output as VariantVerdict;
  return backtestProposal(verdict, verdict.seededAlerts ?? { tp: [], fp: [] });
};

/**
 * Hard gate: 0 when any seeded TP would be suppressed by the proposal, or when the proposal
 * cannot be replayed (fails closed). Branches that do not suppress by alert content
 * (risk_score, threshold, schedule, manual) score N/A, so they cannot inflate the mean.
 */
export const tpSuppressedByTuning: Evaluator = {
  name: 'TPSuppressedByTuning',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const result = backtestOf(output);
    const { verdict, explanation, tpSuppressed, tpTotal } = result;
    if (verdict === 'not_modeled') {
      return { score: null, label: verdict, explanation, metadata: { tpSuppressed, tpTotal } };
    }
    return {
      score: verdict === 'pass' ? 1 : 0,
      label: verdict,
      explanation,
      metadata: { tpSuppressed, tpTotal, tpRetainedShare: result.tpRetainedShare },
    };
  },
};

/**
 * Reported, not gated: the share of seeded FP alerts the proposal removes. N/A when the
 * proposal is not modelled, unparseable, or no FP alerts were seeded.
 */
export const fpSuppressedShare: Evaluator = {
  name: 'FpSuppressedShare',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const { verdict, fpSuppressedShare: share, fpSuppressed, fpTotal } = backtestOf(output);
    if (verdict === 'not_modeled' || verdict === 'unparseable' || share === null) {
      return {
        score: null,
        label: verdict,
        explanation: `FP suppression not measurable (backtest verdict ${verdict})`,
      };
    }
    return {
      score: share,
      label: `${fpSuppressed}/${fpTotal}`,
      explanation: `proposal suppresses ${fpSuppressed}/${fpTotal} seeded FP alerts`,
      metadata: { fpSuppressed, fpTotal },
    };
  },
};
