/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const JEST_CONFIG_NAMES: readonly [
  'jest.config.dev.js',
  'jest.config.js',
  'jest.config.cjs',
  'jest.config.mjs',
  'jest.config.ts',
  'jest.config.json'
];
export interface JestFailedTest {
  file: string;
  line?: number;
  name: string;
  message: string;
  /** True when the failure message matches a known Jest worker OOM/crash signature. */
  oom?: boolean;
}
export interface MoonJestTaskResult {
  project: string;
  configPath?: string;
  cached: boolean;
  passed: boolean;
  testCount: number;
  failures: JestFailedTest[];
}
export interface MoonJestResult {
  taskCount: number;
  cachedCount: number;
  totalTests: number;
  failed: MoonJestTaskResult[];
  exitCode: number;
  verboseDetail?: string;
  failureExcerpt?: string[];
  warnings?: string[];
  /** REPO_ROOT-relative path to the full captured Moon/Jest output, written on failure. */
  logPath?: string;
}
export interface MoonJestProgress {
  completedCount: number;
}
export interface MoonJestParseResult {
  tasks: MoonJestTaskResult[];
  parseFailures: string[];
}
export declare const MOON_JEST_LOG_PATH = 'target/kibana-check-jest-output.log';
/** Mirrors CI's unit-test heap cap (`.buildkite/scripts/steps/test/jest_parallel.sh`). */
export declare const JEST_WORKER_MAX_OLD_SPACE_MB = 4096;
/**
 * Node/V8 takes the last of duplicate `--max-old-space-size` flags in NODE_OPTIONS, so the
 * default must come first: it acts as a floor when NODE_OPTIONS is unset, but a caller who
 * already set their own `--max-old-space-size` (e.g. following the OOM remediation message
 * run_check.ts prints) still wins.
 */
export declare const buildJestNodeOptions: (existingNodeOptions?: string) => string;
/** Walk up from a test file to find the nearest jest config. */
export declare const findJestConfig: (testFilePath: string) => string | undefined;
/**
 * Keep Moon concurrency low so cache-heavy affected runs do not starve the real
 * Jest work of CPU. Example: if 4 configs are scheduled and 3 are cached, we
 * want the 1 uncached Jest process to keep most cores instead of reserving them
 * for Moon slots that finish immediately.
 *
 * maxWorkers is also capped by available memory: on high-core, lower-RAM machines,
 * sizing purely off `cpus` can schedule more concurrent Jest worker processes than
 * the machine can actually hold (each capped at JEST_WORKER_MAX_OLD_SPACE_MB), which
 * OOM-kills a worker without it looking any different from a real test failure.
 *
 * - maxWorkers never drops below 2
 * - Moon concurrency caps at 2
 */
export declare const computeJestParallelism: (estimatedTasks: number) => {
  concurrency: number;
  maxWorkers: number;
};
export declare const parseMoonJestOutput: (output: string) => MoonJestParseResult;
/**
 * When Moon exits non-zero and no Jest task JSON was parsed at all, the Jest process
 * likely crashed before it could report anything. Check the raw output for the same
 * V8 crash signature jest-worker itself looks for (RAW_OOM_SIGNATURE_RE) so we can tell
 * the user "this was OOM" instead of a generic "no output parsed" message.
 */
export declare const buildMoonJestWarnings: ({
  output,
  exitCode,
  taskCount,
  parseFailures,
}: {
  output: string;
  exitCode: number;
  taskCount: number;
  parseFailures: string[];
}) => string[] | undefined;
export declare const runJestViaMoon: ({
  changedFiles,
  verbose,
  downstream,
  onProgress,
}: {
  changedFiles: string[];
  verbose?: boolean;
  downstream?: string;
  onProgress?: (progress: MoonJestProgress) => void;
}) => Promise<MoonJestResult>;
