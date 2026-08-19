import type { PairedTTestResult } from '@kbn/evals-common';
export declare function formatPairedTTestReport({ experimentIdA, experimentIdB, results, significanceThreshold, }: {
    experimentIdA: string;
    experimentIdB: string;
    results: PairedTTestResult[];
    significanceThreshold?: number;
}): {
    header: string[];
    summary: string;
    tableOutput: string;
    significantCount: number;
};
