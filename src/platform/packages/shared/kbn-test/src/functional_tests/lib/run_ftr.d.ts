import type { ToolingLog } from '@kbn/tooling-log';
import type { EsVersion, Config } from '../../functional_test_runner';
export declare function runFtr(options: {
    log: ToolingLog;
    config: Config;
    esVersion: EsVersion;
    signal?: AbortSignal;
    retry?: number;
}): Promise<void>;
export declare function checkForEnabledTestsInFtrConfig(options: {
    log: ToolingLog;
    config: Config;
    esVersion: EsVersion;
}): Promise<boolean>;
