/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FlagOptions, FlagsReader } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
import { type EvalSuiteDefinition } from './suites';
export declare const formatEvalCliCommand: (args: string[]) => string;
export declare const ensureEvalInit: (
  repoRoot: string,
  log: ToolingLog,
  flagsReader: FlagsReader
) => Promise<string | undefined>;
export interface EvalSuiteResolution {
  suite?: EvalSuiteDefinition;
  suiteId?: string;
  configPath?: string;
  resolvedConfigPath: string;
}
export declare const resolveEvalSuite: (
  repoRoot: string,
  log: ToolingLog,
  flagsReader: FlagsReader
) => Promise<EvalSuiteResolution>;
/**
 * The spaces to run in, as `--space-ids` gave them. Validated here so a run
 * that names an impossible space stops before booting a stack for it.
 */
export declare const readSpaceIdsFlag: (flagsReader: FlagsReader) => string[] | undefined;
export interface ResolvedProfileEnv {
  datasetsProfile?: string;
  exportProfile?: string;
  profileEnvOverrides: Record<string, string>;
}
export interface ResolveProfileEnvOverridesOptions {
  repoRoot: string;
  log: ToolingLog;
  flagsReader: FlagsReader;
  profile?: string;
}
export declare const resolveProfileEnvOverrides: ({
  repoRoot,
  log,
  flagsReader,
  profile,
}: ResolveProfileEnvOverridesOptions) => Promise<ResolvedProfileEnv>;
export declare const resolveEvaluationConnectorId: (
  repoRoot: string,
  log: ToolingLog,
  flagsReader: FlagsReader
) => Promise<string>;
export interface EvalRunContext {
  evaluationConnectorId: string;
  projects: string[];
  profileEnvOverrides: Record<string, string>;
  datasetsProfile?: string;
  exportProfile?: string;
  requiresEisCcm: boolean;
}
export interface ResolveEvalRunContextOptions {
  repoRoot: string;
  log: ToolingLog;
  flagsReader: FlagsReader;
  profile?: string;
}
export declare const resolveEvalRunContext: ({
  repoRoot,
  log,
  flagsReader,
  profile,
}: ResolveEvalRunContextOptions) => Promise<EvalRunContext>;
export declare const buildEvalRunEnv: ({
  evaluationConnectorId,
  requiresEisCcm,
  skipServer,
  suite,
  profileEnvOverrides,
  flagsReader,
  log,
}: {
  evaluationConnectorId: string;
  requiresEisCcm: boolean;
  skipServer: boolean;
  suite?: EvalSuiteDefinition;
  profileEnvOverrides: Record<string, string>;
  flagsReader: FlagsReader;
  log: ToolingLog;
}) => Record<string, string>;
export interface BuildEvalRunArgsOptions {
  suiteId?: string;
  configPath?: string;
  evaluationConnectorId: string;
  projects: string[];
  profile?: string;
  flagsReader: FlagsReader;
  skipServer?: boolean;
}
export declare const buildEvalRunArgs: ({
  suiteId,
  configPath,
  evaluationConnectorId,
  projects,
  profile,
  flagsReader,
  skipServer,
}: BuildEvalRunArgsOptions) => string[];
export declare const evalRunFlags: FlagOptions;
