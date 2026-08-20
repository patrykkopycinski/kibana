import type { ToolingLog } from '@kbn/tooling-log';
import type { Lifecycle } from '../lifecycle';
import type { Config } from '../config';
import type { ProviderCollection } from '../providers';
import type { EsVersion } from '../es_version';
interface Options {
    lifecycle: Lifecycle;
    log: ToolingLog;
    config: Config;
    providers: ProviderCollection;
    esVersion: EsVersion;
    skipRootHooks?: boolean;
    reporter?: any;
    reporterOptions?: any;
}
/**
 *  Instantiate mocha and load testfiles into it
 *  @return {Promise<Mocha>}
 */
export declare function setupMocha({ lifecycle, log, config, providers, esVersion, skipRootHooks, reporter, reporterOptions, }: Options): Promise<any>;
export {};
