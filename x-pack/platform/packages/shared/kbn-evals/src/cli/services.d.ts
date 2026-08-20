/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
export declare const EDOT_CONTAINER_NAME = 'kibana-edot-collector';
export type ServiceName = 'edot' | 'scout';
interface ServiceEntry {
  pid: number;
  logFile: string;
  startedAt: string;
  /** SHA-256 of KIBANA_TESTING_AI_CONNECTORS at boot time (Scout only) */
  connectorsHash?: string;
  /** The serverConfigSet used to start Scout */
  serverConfigSet?: string;
  /**
   * SHA-256 of the env the service was started with (Scout: TRACING_EXPORTERS,
   * GCS_CREDENTIALS; EDOT: ELASTICSEARCH_HOST).
   */
  envHash?: string;
}
interface ServicesState {
  edot?: ServiceEntry;
  scout?: ServiceEntry;
}
export declare const readState: (repoRoot: string) => ServicesState;
export declare const isAlive: (pid: number) => boolean;
export declare const connectorsHash: () => string;
export declare const scoutEnvHash: (env: Record<string, string> | undefined) => string;
export declare const edotEnvHash: (elasticsearchHost: string | undefined) => string;
export declare const isServiceRunning: (repoRoot: string, name: ServiceName) => boolean;
/**
 * Returns true if the running Scout was started with a different set of connectors
 * than what's currently in the environment, a different serverConfigSet, or
 * different forwarded env vars (e.g. TRACING_EXPORTERS, GCS_CREDENTIALS).
 */
export declare const isScoutStale: (
  repoRoot: string,
  requestedConfigSet?: string,
  scoutEnv?: Record<string, string>
) => {
  stale: boolean;
  reason?: string;
};
/**
 * Returns true if the running EDOT collector exports to a different
 * Elasticsearch than this run reads traces from. Switching profiles between
 * runs is what moves the target, and a collector left pointing at the previous
 * one goes on accepting spans while indexing them somewhere the trace-based
 * evaluators never look.
 */
export declare const isEdotStale: (
  repoRoot: string,
  elasticsearchHost: string | undefined
) => {
  stale: boolean;
  reason?: string;
};
/**
 * Spawn a detached service process. Stdout/stderr are written to a log file.
 * Returns the child PID.
 */
export declare const startService: (
  repoRoot: string,
  name: ServiceName,
  command: string,
  args: string[],
  log: ToolingLog,
  opts?: {
    connectorsHash?: string;
    serverConfigSet?: string;
    envHash?: string;
    env?: Record<string, string | undefined>;
  }
) => number;
export declare const isEdotDockerRunning: () => boolean;
/**
 * Stop a service by PID. Sends SIGTERM, waits briefly, then SIGKILL if needed.
 * For EDOT, also tears down the Docker container.
 */
export declare const stopService: (
  repoRoot: string,
  name: ServiceName,
  log: ToolingLog
) => Promise<boolean>;
export declare const stopAll: (repoRoot: string, log: ToolingLog) => Promise<boolean>;
/**
 * Tail a service log file, streaming new lines to the ToolingLog.
 * Returns a cleanup function to stop tailing.
 */
export declare const tailLog: (
  repoRoot: string,
  name: ServiceName,
  log: ToolingLog,
  opts?: {
    fromStart?: boolean;
  }
) => () => void;
export {};
