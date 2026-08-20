import type { FlagsReader, FlagOptions } from '@kbn/dev-cli-runner';
import type { EsVersion } from '../../functional_test_runner';
export type StartServerOptions = ReturnType<typeof parseFlags>;
export declare const FLAG_OPTIONS: FlagOptions;
export declare function parseFlags(flags: FlagsReader): {
    config: string;
    esFrom: "serverless" | "snapshot" | "source" | undefined;
    esVersion: EsVersion;
    installDir: string | undefined;
    logsDir: string | undefined;
};
