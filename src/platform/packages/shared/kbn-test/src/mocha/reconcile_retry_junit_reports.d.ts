import type { ToolingLog } from '@kbn/tooling-log';
/**
 * When FTR retries failed test files, each run writes its own JUnit report
 * (`report`, `report-1`, ...). A retry re-runs the *entire* failing test file,
 * so the newest report for that file supersedes every earlier one. Left as-is,
 * CI failure aggregation scans all reports and still counts the original
 * failure even after a retry passed.
 *
 * This reconciles the family of reports so each test file is represented only
 * by its most recent run: stale entries are dropped from earlier reports (keyed
 * by `classname`, which encodes the test file), suite counts are recomputed,
 * and reports left empty are deleted.
 */
export declare function reconcileRetryJunitReports(options: {
    log: ToolingLog;
    reportName: string;
    rootDirectory?: string;
}): Promise<void>;
