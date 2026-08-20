/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
/**
 * LLM-as-a-judge evaluator that scores multi-turn conversation quality across four
 * dimensions: topic consistency, context retention, contradiction detection, and
 * resolution quality. Each dimension is scored 0–1 by the LLM, then averaged.
 *
 * Uses retry logic for resilience against transient LLM failures. Validates that
 * all returned scores are finite numbers in the [0, 1] range.
 *
 * @param config.inferenceClient - Bound inference client for LLM calls
 * @param config.log - Logger for retry warnings and error reporting
 */
export declare function createConversationCoherenceEvaluator(config: {
  inferenceClient: BoundInferenceClient;
  log: ToolingLog;
}): Evaluator;
