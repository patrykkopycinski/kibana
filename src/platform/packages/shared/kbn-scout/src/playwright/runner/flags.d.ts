import type { FlagOptions, FlagsReader } from '@kbn/dev-cli-runner';
import type { ScoutTestTarget } from '@kbn/scout-info';
export interface RunTestsOptions {
    testTarget: ScoutTestTarget;
    configPath: string;
    headed: boolean;
    repeatEach: number | undefined;
    testFiles?: string[];
    esFrom: 'serverless' | 'source' | 'snapshot' | undefined;
    installDir: string | undefined;
    logsDir: string | undefined;
}
export declare const TEST_FLAG_OPTIONS: FlagOptions;
export declare function parseTestFlags(flags: FlagsReader): Promise<{
    testTarget: ScoutTestTarget;
    serverConfigSet: string;
    esFrom: "serverless" | "snapshot" | "source" | undefined;
    preserveEsData: boolean;
    installDir: string | undefined;
    logsDir: string | undefined;
    configPath: string;
    headed: boolean;
    repeatEach: number | undefined;
    testFiles?: string[] | undefined;
}>;
