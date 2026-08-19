import type { ToolingLog } from '@kbn/tooling-log';
import type { Config } from '../config';
import type { Lifecycle } from '../lifecycle';
import type { ProviderCollection } from '../providers';
interface Options {
    mocha: any;
    log: ToolingLog;
    config: Config;
    lifecycle: Lifecycle;
    providers: ProviderCollection;
    paths: string[];
    updateBaselines: boolean;
    updateSnapshots: boolean;
}
/**
 *  Load an array of test files or a test provider into a mocha instance
 */
export declare const loadTests: ({ mocha, log, config, lifecycle, providers, paths, updateBaselines, updateSnapshots, }: Options) => void;
export {};
