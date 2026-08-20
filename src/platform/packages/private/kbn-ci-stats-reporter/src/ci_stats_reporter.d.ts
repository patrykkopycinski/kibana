import type { Config, CiStatsMetadata } from '@kbn/ci-stats-core';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { CiStatsTestGroupInfo, CiStatsTestRun } from './ci_stats_test_group_types';
/** A ci-stats metric record */
export interface CiStatsMetric {
    /** Top-level categorization for the metric, e.g. "page load bundle size" */
    group: string;
    /** Specific sub-set of the "group", e.g. "dashboard" */
    id: string;
    /** integer value recorded as the value of this metric */
    value: number;
    /** optional limit which will generate an error on PRs when the metric exceeds the limit */
    limit?: number;
    /**
     * path, relative to the repo, where the config file containing limits
     * is kept. Linked from PR comments instructing contributors how to fix
     * their PRs.
     */
    limitConfigPath?: string;
    /** Arbitrary key-value pairs which can be used for additional filtering/reporting */
    meta?: CiStatsMetadata;
}
export type PerformanceMetrics = Record<string, number>;
/** A ci-stats timing event */
export interface CiStatsTiming {
    /** Top-level categorization for the timing, e.g. "scripts/foo", process type, etc. */
    group: string;
    /** Specific timing (witin the "group" being tracked) e.g. "total" */
    id: string;
    /** time in milliseconds which should be recorded */
    ms: number;
    /** hash of key-value pairs which will be stored with the timing for additional filtering and reporting */
    meta?: CiStatsMetadata;
}
/** Options for reporting timings to ci-stats */
export interface TimingsOptions {
    /** list of timings to record */
    timings: CiStatsTiming[];
    /** master, 7.x, etc, automatically detected from package.json if not specified */
    upstreamBranch?: string;
    /** value of data/uuid, automatically loaded if not specified */
    kibanaUuid?: string | null;
}
/** Options for reporting metrics to ci-stats */
export interface MetricsOptions {
    /** Default metadata to add to each metric */
    defaultMeta?: CiStatsMetadata;
}
/** Options for reporting tests to ci-stats */
export interface CiStatsReportTestsOptions {
    /**
     * Information about the group of tests that were run
     */
    group: CiStatsTestGroupInfo;
    /**
     * Information about each test that ran, including failure information
     */
    testRuns: CiStatsTestRun[];
}
/** Object that helps report data to the ci-stats service */
export declare class CiStatsReporter {
    private readonly config;
    private readonly log;
    /**
     * Create a CiStatsReporter by inspecting the ENV for the necessary config
     */
    static fromEnv(log: SomeDevLog): CiStatsReporter;
    constructor(config: Config | undefined, log: SomeDevLog);
    /**
     * Determine if CI_STATS is explicitly disabled by the environment. To determine
     * if the CiStatsReporter has enough information in the environment to send metrics
     * for builds use #hasBuildConfig().
     */
    isEnabled(): boolean;
    /**
     * Determines if the CiStatsReporter is disabled by the environment, or properly
     * configured and able to send stats
     */
    hasBuildConfig(): boolean;
    /**
     * Report timings data to the ci-stats service. If running in CI then the reporter
     * will include the buildId in the report with the access token, otherwise the timings
     * data will be recorded as anonymous timing data.
     */
    timings(options: TimingsOptions): Promise<boolean | undefined>;
    /**
     * Report metrics data to the ci-stats service. If running outside of CI this method
     * does nothing as metrics can only be reported when associated with a specific CI build.
     */
    metrics(metrics: CiStatsMetric[], options?: MetricsOptions): Promise<boolean | undefined>;
    /**
     * Send test reports to ci-stats
     */
    reportTests({ group, testRuns }: CiStatsReportTestsOptions): Promise<void>;
    reportPerformanceMetrics(metrics: PerformanceMetrics): Promise<boolean | undefined>;
    /**
     * In order to allow this code to run before @kbn/utils is built
     */
    private getUpstreamBranch;
    /**
     * In order to allow this code to run before @kbn/utils is built
     */
    private getKibanaUuid;
    private req;
}
