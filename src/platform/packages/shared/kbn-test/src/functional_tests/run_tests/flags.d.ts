import type { FlagsReader, FlagOptions } from '@kbn/dev-cli-runner';
import type { EsVersion } from '../../functional_test_runner';
export type RunTestsOptions = ReturnType<typeof parseFlags>;
export declare const FLAG_OPTIONS: FlagOptions;
export declare function parseFlags(flags: FlagsReader): {
    configs: string[];
    esVersion: EsVersion;
    bail: boolean;
    retry: number;
    dryRun: boolean;
    updateBaselines: boolean;
    updateSnapshots: boolean;
    logsDir: string | undefined;
    esFrom: "serverless" | "snapshot" | "source" | undefined;
    esServerlessImage: string | undefined;
    installDir: string | undefined;
    grep: string | undefined;
    suiteTags: {
        include: string[];
        exclude: string[];
    };
    suiteFilters: {
        include: string[];
        exclude: string[];
    };
};
