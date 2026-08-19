import type { Client } from '@elastic/elasticsearch';
import type { EsArchiverFixture } from './es_archiver';
export interface LinkedProjectFixture {
    esClient: Client;
    esArchiver: EsArchiverFixture;
}
export declare const linkedEsFixtures: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & import("./core_fixtures").BaseWorkerFixtures & {
    linkedProject: LinkedProjectFixture;
}>;
