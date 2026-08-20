/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvaluateResponse } from '@kbn/evals-common';
import { type EvaluateRequestBodyInput } from '@kbn/evals-common';
import type { Evaluator, EvaluatorKind, EvaluatorParams, Example, TaskOutput } from '../types';
export type MapContextFn<TOutput = TaskOutput> = (params: EvaluatorParams<Example, TOutput>) => {
  trace_id: string;
  reference_data?: Record<string, unknown>;
};
/** `key` matches the score's `name` in the API response; `evaluatorName` is the name it's reported under. */
export interface SubScore {
  key: string;
  evaluatorName: string;
}
export interface EvaluatorConfig {
  name: string;
  kind: EvaluatorKind;
  version?: string;
  connectorId?: string;
  /** When set, the evaluator is composite: one output evaluator is produced per sub-score. */
  subScores?: SubScore[];
}
export declare class EvaluatorApiClient {
  private readonly kbnClient;
  private readonly log;
  constructor(kbnClient: KbnClient, log: SomeDevLog);
  evaluate(body: EvaluateRequestBodyInput): Promise<EvaluateResponse>;
  /** Converts configs into {@link Evaluator}s, batching all configs into one API call per trace. */
  toEvaluators(
    configs: EvaluatorConfig[],
    options?: {
      mapContext?: MapContextFn;
    }
  ): Evaluator[];
}
