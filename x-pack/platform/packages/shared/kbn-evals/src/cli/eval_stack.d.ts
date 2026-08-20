/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
export interface EnsureEdotOptions {
  repoRoot: string;
  log: ToolingLog;
  elasticsearchHost: string | undefined;
}
/**
 * Ensures the EDOT collector is running (exports traces to the configured ES),
 * reusing an existing instance unless it points at a different Elasticsearch.
 */
export declare const ensureEdot: ({
  repoRoot,
  log,
  elasticsearchHost,
}: EnsureEdotOptions) => Promise<void>;
export interface EnsureScoutOptions {
  repoRoot: string;
  log: ToolingLog;
  gcsCredentials: string | undefined;
  tracingExporters: string | undefined;
  serverConfigSet?: string;
}
/**
 * Ensures the Scout server (ES + Kibana) is running and reachable, restarting it
 * when the existing instance is stale or unhealthy.
 */
export declare const ensureScout: ({
  repoRoot,
  log,
  gcsCredentials,
  tracingExporters,
  serverConfigSet,
}: EnsureScoutOptions) => Promise<void>;
export interface EnsureEisCcmOptions {
  repoRoot: string;
  log: ToolingLog;
}
/**
 * Enables EIS (Cloud Connected Mode).
 */
export declare const ensureEisCcm: ({ repoRoot, log }: EnsureEisCcmOptions) => Promise<void>;
export interface EnsureEvalStackOptions {
  repoRoot: string;
  log: ToolingLog;
  profileEnvOverrides: Record<string, string>;
  serverConfigSet?: string;
  requiresEisCcm: boolean;
}
/**
 * Boots EDOT collector, Scout server, and EIS CCM as background daemons by
 * composing the individual `ensure*` steps.
 */
export declare const ensureEvalStack: ({
  repoRoot,
  log,
  profileEnvOverrides,
  serverConfigSet,
  requiresEisCcm,
}: EnsureEvalStackOptions) => Promise<void>;
