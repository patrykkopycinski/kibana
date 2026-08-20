/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Splits a suite across several CI steps so a long suite fits inside the Buildkite step timeout.
 * Each shard becomes its own step (per connector) with its own Scout stack, running only the spec
 * files it lists. Paths are relative to the suite root (the directory holding `configPath`) and
 * must partition the suite: CI fails the fanout if one is missing, and the suite's own coverage
 * test fails if a spec is listed twice or not at all.
 */
export interface EvalSuiteShard {
  id: string;
  specFiles: string[];
}
export interface EvalSuiteMetadata {
  id: string;
  name?: string;
  description?: string;
  configPath: string;
  tags?: string[];
  ciLabels?: string[];
  serverConfigSet?: string;
  shards?: EvalSuiteShard[];
  stepTimeoutInMinutes?: number;
}
export interface EvalSuiteDefinition {
  id: string;
  name: string;
  configPath: string;
  absoluteConfigPath: string;
  suiteRoot: string | null;
  relativeSuiteRoot: string | null;
  tags: string[];
  ciLabels: string[];
  description?: string;
  source: 'metadata' | 'discovery';
  serverConfigSet?: string;
  shards?: EvalSuiteShard[];
  stepTimeoutInMinutes?: number;
}
export declare const readSuiteMetadata: (repoRoot: string, log?: ToolingLog) => EvalSuiteMetadata[];
export declare const discoverEvalSuites: (
  repoRoot: string,
  log?: ToolingLog
) => EvalSuiteDefinition[];
export declare const resolveEvalSuites: (
  repoRoot: string,
  log?: ToolingLog,
  options?: {
    refresh?: boolean;
  }
) => EvalSuiteDefinition[];
