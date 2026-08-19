import type { ToolingLog } from '@kbn/tooling-log';
import { Config, EsVersion } from './lib';
export declare class FunctionalTestRunner {
    private readonly log;
    private readonly config;
    private readonly esVersion;
    constructor(log: ToolingLog, config: Config, esVersion?: string | EsVersion);
    run(abortSignal?: AbortSignal, retry?: number): Promise<any>;
    private runWithResult;
    private createRetryConfig;
    private validateEsVersion;
    getTestStats(): Promise<{
        testCount: number;
        nonSkippedTestCount: number;
        testsExcludedByTag: any;
    } | undefined>;
    private getStubProviderCollection;
    private runHarness;
    private triggerCleanup;
    simulateMochaDryRun(mocha: any): number;
}
