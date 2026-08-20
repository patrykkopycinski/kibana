/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '../../types';
type AggregationStrategy = 'mean' | 'median' | 'majority';
/**
 * Meta-evaluator that aggregates scores from multiple judge evaluators using a
 * configurable strategy (mean, median, or majority vote).
 *
 * Individual judge failures are handled gracefully — failed judges are logged via
 * the optional logger and excluded from aggregation. The evaluator's `kind` is
 * derived from the judges: 'LLM' if any judge is LLM-based, 'CODE' otherwise.
 *
 * @param config.judges - Array of evaluators to aggregate
 * @param config.strategy - Aggregation method: 'mean' | 'median' | 'majority' (default: 'mean')
 * @param config.logger - Optional logger for warning on judge failures
 */
export declare function createMultiJudgeEvaluator(config: {
  judges: Evaluator[];
  strategy?: AggregationStrategy;
  logger?: {
    warn: (msg: string) => void;
  };
}): Evaluator;
export {};
