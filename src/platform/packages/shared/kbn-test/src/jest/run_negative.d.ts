/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface NegativeScenario {
  name: string;
  description: string;
  /** REPO_ROOT-relative path to the canary Jest config. */
  configPath: string;
  /** Exit code the runner must produce; `'timeout'` means we expect it to hang and kill it. */
  expectedExitCode: number | 'timeout';
  /** All must appear in the runner output for the scenario to pass. */
  expectedPatterns: RegExp[];
  env?: Record<string, string>;
  timeoutMs?: number;
}
export interface ScenarioEvaluation {
  exitCodeMatched: boolean;
  missingPatterns: RegExp[];
  passedAsExpected: boolean;
}
export interface ScenarioOutcome extends ScenarioEvaluation {
  scenario: NegativeScenario;
  exitCode: number | 'timeout';
  durationMs: number;
}
export declare const NEGATIVE_SCENARIOS: NegativeScenario[];
/** Entry point for `scripts/jest_negative`. */
export declare const runJestNegative: () => Promise<never>;
export declare const evaluateScenario: (
  scenario: NegativeScenario,
  exitCode: number | 'timeout',
  output: string
) => ScenarioEvaluation;
