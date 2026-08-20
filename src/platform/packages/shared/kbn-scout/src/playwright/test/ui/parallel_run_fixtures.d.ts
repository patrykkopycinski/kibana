/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ApiServicesFixture,
  EsClient,
  KbnClient,
  KibanaUrl,
  ScoutLogger,
  ScoutSpaceParallelFixture,
  ScoutTestConfig,
} from '../../fixtures/scope/worker';
import type {
  BrowserAuthFixture,
  ScoutPage,
  PageObjects,
  NetworkFixture,
} from '../../fixtures/scope/test';
export declare const scoutParallelFixtures: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      context: import('playwright-core').BrowserContext;
    } & {
      browserAuth: BrowserAuthFixture;
    } & {
      page: ScoutPage;
    } & {
      pageObjects: PageObjects;
    } & {
      network: import('../../fixtures/scope/test/network/network').Network;
      page: ScoutPage;
    } & {
      validateTags: void;
    },
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      scoutSpace: ScoutSpaceParallelFixture;
    } & {
      apiServices: ApiServicesFixture;
    } & {
      log: ScoutLogger;
      kbnUrl: KibanaUrl;
      scoutSpace: ScoutSpaceParallelFixture;
    } & {
      scoutSpace: ScoutSpaceParallelFixture;
      config: ScoutTestConfig;
    }
>;
export interface ScoutParallelTestFixtures {
  browserAuth: BrowserAuthFixture;
  page: ScoutPage;
  pageObjects: PageObjects;
  network: NetworkFixture;
}
export interface ScoutParallelWorkerFixtures {
  log: ScoutLogger;
  config: ScoutTestConfig;
  kbnUrl: KibanaUrl;
  kbnClient: KbnClient;
  esClient: EsClient;
  scoutSpace: ScoutSpaceParallelFixture;
  apiServices: ApiServicesFixture;
  isSnapshotBuild: boolean;
}
export declare const globalSetupFixtures: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      esArchiver: import('../..').EsArchiverFixture;
    } & {
      apiServices: ApiServicesFixture;
    }
>;
/**
 * Fixtures available in the global teardown hook (`global.teardown.ts`).
 *
 * Intentionally narrower than `globalSetupFixtures`: `esArchiver` is omitted on
 * purpose. Scout's `esArchiver` fixture only exposes `loadIfNeeded` (see
 * `fixtures/scope/worker/es_archiver.ts`) — archive-driven unloading is not
 * supported by design, because deleting indexes that way is slow and offers
 * no real benefit (leftover indexes in the cluster don't affect test outcomes
 * once setup is idempotent). For state that *does* need to be reset across
 * configs sharing the cluster (e.g. server-wide feature-flag overrides,
 * legacy/hand-indexed data), teardown should use direct primitives:
 *   - `esClient.indices.delete` / `deleteByQuery` / `indices.deleteDataStream`
 *   - `kbnClient.savedObjects.*` and `kbnClient.uiSettings.{unset,update,updateGlobal}`
 *   - `apiServices.*` (e.g. `apiServices.core.settings(...)` to revert feature flags)
 *
 * This is also consistent with the `scout_no_es_archiver_in_parallel_tests`
 * ESLint rule, which only allows `esArchiver` in `global.setup.ts`.
 */
export declare const globalTeardownFixtures: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      apiServices: ApiServicesFixture;
    }
>;
