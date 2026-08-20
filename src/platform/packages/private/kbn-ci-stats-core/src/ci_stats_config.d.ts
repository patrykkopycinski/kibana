import type { SomeDevLog } from '@kbn/some-dev-log';
/**
 * Information about how CiStatsReporter should talk to the ci-stats service. Normally
 * it is read from a JSON environment variable using the `parseConfig()` function
 * exported by this module.
 */
export interface Config {
    /** ApiToken necessary for writing build data to ci-stats service */
    apiToken: string;
    /**
     * uuid which should be obtained by first creating a build with the
     * ci-stats service and then passing it to all subsequent steps
     */
    buildId: string;
}
export declare function parseConfig(log: SomeDevLog): Config | undefined;
