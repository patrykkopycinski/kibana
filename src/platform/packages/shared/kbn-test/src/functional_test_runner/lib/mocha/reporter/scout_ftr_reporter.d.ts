import { ToolingLog } from '@kbn/tooling-log';
import type { Runner, Test } from '../../../fake_mocha_types';
import type { Config as FTRConfig } from '../../config';
/**
 * Configuration options for the Scout Mocha reporter
 */
export interface ScoutFTRReporterOptions {
    name?: string;
    outputPath?: string;
}
/**
 * Scout Mocha reporter
 */
export declare class ScoutFTRReporter {
    private runner;
    private reporterOptions;
    readonly log: ToolingLog;
    readonly name: string;
    readonly runId: string;
    private report;
    private readonly baseTestRunInfo;
    private readonly codeOwnersEntries;
    constructor(runner: Runner, config: FTRConfig, reporterOptions?: ScoutFTRReporterOptions);
    private getFileOwners;
    private getOwnerAreas;
    private getScoutFileInfoForPath;
    /**
     * Root path of this reporter's output
     */
    get reportRootPath(): string;
    onRunStart: () => void;
    onTestStart: (test: Test) => void;
    onTestEnd: (test: Test) => void;
    onRunEnd: () => void;
}
