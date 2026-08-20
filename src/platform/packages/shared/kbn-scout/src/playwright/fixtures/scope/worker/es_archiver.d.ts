import type { LoadActionPerfOptions } from '@kbn/es-archiver';
import type { IndexStats } from '@kbn/es-archiver/src/lib/stats';
export interface EsArchiverFixture {
    /**
     * Loads an Elasticsearch archive if the specified data index is not present.
     * @param name The name of the archive to load.
     * @param performance An object of type LoadActionPerfOptions to measure and
     * report performance metrics during the load operation.
     * @returns A Promise that resolves to an object containing index statistics.
     */
    loadIfNeeded: (name: string, performance?: LoadActionPerfOptions | undefined) => Promise<Record<string, IndexStats>>;
}
export declare const esArchiverFixture: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("./core_fixtures").BaseWorkerFixtures & {
    esArchiver: EsArchiverFixture;
}>;
