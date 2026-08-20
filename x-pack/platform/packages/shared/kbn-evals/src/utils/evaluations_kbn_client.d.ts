/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/kbn-client';
export interface GetEvaluationsKbnClientParams {
  kbnClient: KbnClient;
  log: ToolingLog;
  evaluationsKbnUrl?: string;
  evaluationsKbnApiKey?: string;
  createKbnClient?: (args: { log: ToolingLog; url: string }) => KbnClient;
}
export declare function withKbnClientDefaultHeaders(
  kbnClient: KbnClient,
  defaultHeaders: Record<string, string>
): KbnClient;
export declare function withKbnClientApiKeyAuth(kbnClient: KbnClient, apiKey: string): KbnClient;
export declare function getEvaluationsKbnClient({
  kbnClient,
  log,
  evaluationsKbnUrl,
  evaluationsKbnApiKey,
  createKbnClient,
}: GetEvaluationsKbnClientParams): KbnClient;
