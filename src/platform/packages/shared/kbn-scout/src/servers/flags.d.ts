import type { FlagOptions, FlagsReader } from '@kbn/dev-cli-runner';
import type { ScoutTestTarget } from '@kbn/scout-info';
export type StartServerOptions = ReturnType<typeof parseServerFlags>;
export declare const SERVER_FLAG_OPTIONS: FlagOptions;
export declare function parseServerFlags(flags: FlagsReader): {
    testTarget: ScoutTestTarget;
    serverConfigSet: string;
    esFrom: "serverless" | "snapshot" | "source" | undefined;
    preserveEsData: boolean;
    installDir: string | undefined;
    logsDir: string | undefined;
};
