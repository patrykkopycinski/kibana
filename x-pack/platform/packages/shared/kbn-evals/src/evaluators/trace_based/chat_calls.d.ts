/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
/**
 * Counts the LLM round-trips in a trace. Agentic flows re-send the whole
 * context on every step, so token totals and summed latency scale with this
 * count as much as they do with prompt size. Without it, a change in how many
 * steps the model takes is indistinguishable from a change in per-call cost.
 */
export declare function createChatCallsEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator;
