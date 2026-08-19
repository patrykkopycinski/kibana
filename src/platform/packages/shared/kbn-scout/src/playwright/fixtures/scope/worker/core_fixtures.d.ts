import type { KbnClient } from '@kbn/kbn-client';
import type { Client } from '@elastic/elasticsearch';
import type { KibanaUrl } from '../../../../common/services';
import { ScoutLogger } from '../../../../common/services';
import type { ScoutTestConfig } from '.';
export type { KbnClient } from '@kbn/kbn-client';
export type { SamlSessionManager } from '@kbn/test-saml-auth';
export type { Client as EsClient } from '@elastic/elasticsearch';
export type { KibanaUrl } from '../../../../common/services/kibana_url';
export type { ScoutTestConfig } from '../../../../types';
export type { ScoutLogger } from '../../../../common/services/logger';
export interface CookieHeader {
    [Cookie: string]: string;
}
export interface RoleSessionCredentials {
    cookieValue: string;
    cookieHeader: CookieHeader;
}
export interface BaseWorkerFixtures {
    log: ScoutLogger;
    config: ScoutTestConfig;
    kbnUrl: KibanaUrl;
    esClient: Client;
    kbnClient: KbnClient;
    /**
     * `true` when the target Elasticsearch cluster is a SNAPSHOT build. SNAPSHOT
     * builds bundle test-only modules (e.g. the `shard_delay` aggregation) that
     * are unavailable in release builds. Use this to gate tests that rely on
     * those features:
     *
     * @example
     * test('uses shard_delay agg', async ({ esClient, isSnapshotBuild }) => {
     *   test.skip(!isSnapshotBuild, 'Requires shard_delay agg (SNAPSHOT only)');
     *   // ...
     * });
     */
    isSnapshotBuild: boolean;
}
/**
 * The coreWorkerFixtures setup defines foundational fixtures that are essential
 * for running tests in the "kbn-scout" framework. These fixtures provide reusable,
 * scoped resources for each Playwright worker, ensuring that tests have consistent
 * and isolated access to critical services such as logging, configuration, and
 * clients for interacting with Kibana and Elasticsearch.
 *
 * Note: `samlAuth` is added by the `samlAuthFixture` in `./saml_auth/index.ts`, which
 * extends this base. The combined fixture (with samlAuth) is what `worker/index.ts` exports.
 */
export declare const coreWorkerFixtures: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions & BaseWorkerFixtures>;
