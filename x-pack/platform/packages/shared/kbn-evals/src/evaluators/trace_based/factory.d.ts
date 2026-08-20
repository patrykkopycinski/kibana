/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
interface EsqlResponse {
  columns: Array<{
    name: string;
    type: string;
  }>;
  values: any[][];
}
export interface TraceBasedEvaluatorConfig {
  name: string;
  buildQuery: (traceId: string) => string;
  extractResult: (response: EsqlResponse) => number | null;
  isResultValid?: (result: number | null) => boolean;
  isNotReported?: (response: EsqlResponse) => boolean;
  notReportedProbe?: {
    matchesQueryError: (error: unknown) => boolean;
    buildQuery: (traceId: string) => string;
    isTraceComplete: (response: EsqlResponse) => boolean;
  };
}
export declare function createTraceBasedEvaluator({
  traceEsClient,
  log,
  config,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
  config: TraceBasedEvaluatorConfig;
}): Evaluator;
export {};
