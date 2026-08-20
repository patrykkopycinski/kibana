/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
type EvaluationCriterionText = string;
export interface EvaluationCriterionStructured {
  id: string;
  text: string;
  score?: number;
}
export type EvaluationCriterion = EvaluationCriterionStructured | EvaluationCriterionText;
export declare function createCriteriaEvaluator({
  inferenceClient,
  criteria,
  log,
}: {
  inferenceClient: BoundInferenceClient;
  criteria?: EvaluationCriterion[];
  log: ToolingLog;
}): Evaluator;
export {};
