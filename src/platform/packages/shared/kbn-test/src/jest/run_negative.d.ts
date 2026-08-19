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
export declare const evaluateScenario: (scenario: NegativeScenario, exitCode: number | 'timeout', output: string) => ScenarioEvaluation;
