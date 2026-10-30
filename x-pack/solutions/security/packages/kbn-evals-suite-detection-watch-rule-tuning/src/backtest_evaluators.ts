/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import { backtestProposal, type BacktestAlerts, type BacktestResult } from './backtest_grader';
import type { RuleTuningVerdict } from './workflow_task';

/**
 * A run with no usable proposal is a failure, not an N/A: only a valid proposal on a branch
 * that does not suppress by alert content is legitimately `not_modeled`. In production the
 * "no change_type" case arrives as `executionStatus: 'failed'`: `readProposalOrThrow` throws
 * `NoProposalError` when the diagnose output has no change_type and the variant-matrix task
 * (`runVariantWorkflow`) converts it into a failed verdict. The `!change_type` check is a
 * backstop for verdicts built any other way.
 */
const noProposalOf = (output: unknown): boolean => {
  const verdict = output as VariantVerdict;
  return verdict.executionStatus !== 'completed' || !verdict.change_type;
};

/** The review verdict plus the alerts the task seeded, which is what the backtest replays over. */
export interface VariantVerdict extends RuleTuningVerdict {
  seededAlerts?: BacktestAlerts;
  /** Why the run has no proposal (set by `runVariantWorkflow`); surfaced in the explanation. */
  error?: string;
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
    if (noProposalOf(output)) {
      return {
        score: 0,
        label: 'no_proposal',
        explanation: `workflow produced no usable proposal (not completed or no change_type)${
          (output as VariantVerdict).error ? `: ${(output as VariantVerdict).error}` : ''
        }`,
      };
    }
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
    if (noProposalOf(output)) {
      return {
        score: null,
        label: 'no_proposal',
        explanation: 'FP suppression not measurable (no usable proposal)',
      };
    }
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
