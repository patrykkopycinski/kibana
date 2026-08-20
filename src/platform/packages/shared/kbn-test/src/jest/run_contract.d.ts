import type { ProcRunner } from '@kbn/dev-proc-runner';
import { type ValidationBaseContext } from '@kbn/dev-validation-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export declare const JEST_LABEL = "jest";
export declare const JEST_LOG_PREFIX = "[jest]";
type JestContractTestMode = 'related' | 'affected';
export interface JestChangedFileEntry {
    repoRelPath: string;
    owningConfigPath?: string;
    isConfigFile: boolean;
    isTestFile: boolean;
}
export interface JestContractRunPlan {
    configPath: string;
    mode: 'full' | 'related';
    relatedFiles?: string[];
}
export interface JestConfigResult {
    index: number;
    total: number;
    config: string;
    passed: boolean;
    testCount: number;
    failureOutput?: string;
    command: string;
}
export interface JestValidationResult {
    configCount: number;
    testCount: number;
}
export interface ExecuteJestValidationOptions {
    baseContext: ValidationBaseContext;
    log: ToolingLog;
    passthroughArgs?: string[];
    procRunner: Pick<ProcRunner, 'run'>;
    onConfigResult?: (result: JestConfigResult) => void;
}
/** Builds per-config Jest run plans from changed files and the selected test mode. */
export declare const planJestContractRuns: ({ entries, testMode, }: {
    entries: JestChangedFileEntry[];
    testMode: JestContractTestMode;
}) => JestContractRunPlan[];
/**
 * Resolves scoped Jest targets from the validation contract and executes the
 * required config runs via Moon, including downstream expansion when requested.
 */
export declare const executeJestValidation: ({ baseContext, log, passthroughArgs, procRunner, }: ExecuteJestValidationOptions) => Promise<JestValidationResult | null>;
/** Runs the validation-contract-aware `scripts/jest` CLI entrypoint. */
export declare const runJestContract: () => void;
export {};
