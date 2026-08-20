/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
type EsqlPredictionExtractor<T = unknown> = (output: T) => string;
type EsqlGroundTruthExtractor<T = unknown> = (expected: T) => string;
export declare const ESQL_EQUIVALENCE_EVALUATOR_NAME = 'ES|QL Functional Equivalence';
export declare function createEsqlEquivalenceEvaluator({
  inferenceClient,
  log,
  predictionExtractor,
  groundTruthExtractor,
}: {
  inferenceClient: BoundInferenceClient;
  log: ToolingLog;
  predictionExtractor: EsqlPredictionExtractor;
  groundTruthExtractor: EsqlGroundTruthExtractor;
}): Evaluator;
export {};
