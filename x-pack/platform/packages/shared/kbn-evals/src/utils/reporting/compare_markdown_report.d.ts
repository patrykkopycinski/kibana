import type { PairedTTestResult } from '@kbn/evals-common';
export declare function formatMarkdownCompareReport({ experimentIdA, experimentIdB, results, significanceThreshold, comparePageUrl, baselineTimestamp, baselineCommitSha, refreshBaselineUrl, skippedMissingPairs, skippedNullScores, baselineBranch, }: {
    experimentIdA: string;
    experimentIdB: string;
    results: PairedTTestResult[];
    significanceThreshold?: number;
    comparePageUrl?: string;
    baselineTimestamp?: string;
    baselineCommitSha?: string;
    refreshBaselineUrl?: string;
    skippedMissingPairs?: number;
    skippedNullScores?: number;
    baselineBranch?: string;
}): string;
