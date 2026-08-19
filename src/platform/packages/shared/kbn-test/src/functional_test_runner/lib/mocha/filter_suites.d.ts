import type { ToolingLog } from '@kbn/tooling-log';
import type { EsVersion } from '../es_version';
interface Options {
    log: ToolingLog;
    mocha: any;
    include: string[];
    exclude: string[];
    esVersion?: EsVersion;
}
/**
 * Given a mocha instance that has already loaded all of its suites, filter out
 * the suites based on the include/exclude tags. If there are include tags then
 * only suites which include the tag will be run, and if there are exclude tags
 * then any suite with that tag will not be run.
 *
 * @param options.mocha instance of mocha that we are going to be running
 * @param options.include an array of tags that suites must be tagged with to be run
 * @param options.exclude an array of tags that will be used to exclude suites from the run
 */
export declare function filterSuites({ log, mocha, include, exclude, esVersion }: Options): void;
export {};
