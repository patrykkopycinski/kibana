/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
import { createTraceBasedEvaluator } from './factory';

export function createOutputTokensEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: 'Output Tokens',
      // gen_ai.usage.output_tokens is mapped as integer in some traces-agent_builder.otel
      // backing indices and long in others (schema drift across data stream rollovers).
      // ES|QL's STATS SUM() over a field with ambiguous types across shards throws
      // verification_exception; TO_LONG() normalizes the type before aggregation so the
      // query runs regardless of which backing index a given trace's docs live in.
      buildQuery: (traceId) => `FROM traces-*
        | WHERE trace_id == "${traceId}"
        | STATS 
        output_tokens = SUM(TO_LONG(attributes.gen_ai.usage.output_tokens))`,
      extractResult: (response) => {
        const { columns, values } = response;
        const row = values[0];
        const outputTokensIdx = columns.findIndex((col) => col.name === 'output_tokens');
        return row[outputTokensIdx];
      },
      isResultValid: (result) => result !== null && result > 0,
    },
  });
}

export function createInputTokensEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: 'Input Tokens',
      buildQuery: (traceId) => `FROM traces-*
        | WHERE trace_id == "${traceId}"
        | STATS 
        input_tokens = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens))`,
      extractResult: (response) => {
        const { columns, values } = response;
        const row = values[0];
        const inputTokensIdx = columns.findIndex((col) => col.name === 'input_tokens');
        return row[inputTokensIdx];
      },
      isResultValid: (result) => result !== null && result > 0,
    },
  });
}

export function createCachedTokensEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: 'Cached Tokens',
      buildQuery: (traceId) => `FROM traces-*
        | WHERE trace_id == "${traceId}"
        | STATS 
        cached_tokens = SUM(TO_LONG(attributes.gen_ai.usage.cache_read.input_tokens))`,
      extractResult: (response) => {
        const { columns, values } = response;
        const row = values[0];
        const cachedTokensIdx = columns.findIndex((col) => col.name === 'cached_tokens');
        return row[cachedTokensIdx];
      },
      isResultValid: (result) => result !== null,
    },
  });
}
