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
  EsArchiverFixture,
  LinkedProjectFixture,
  EsClient,
  KbnClient,
  KibanaUrl,
  ScoutLogger,
  ScoutTestConfig,
  UiSettingsFixture,
} from '../../fixtures/scope/worker';
import type {
  BrowserAuthFixture,
  ScoutPage,
  PageObjects,
  PerfTrackerFixture,
  NetworkFixture,
} from '../../fixtures/scope/test';
export type { ScoutPage, PageObjects, BrowserAuthFixture } from '../../fixtures/scope/test';
export type { ApiServicesFixture, LighthouseAuditOptions } from '../../fixtures/scope/worker';
export declare const scoutFixtures: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      context: import('playwright-core').BrowserContext;
    } & {
      browserAuth: BrowserAuthFixture;
    } & {
      page: ScoutPage;
      log: ScoutLogger;
    } & {
      pageObjects: PageObjects;
    } & {
      network: import('../../fixtures/scope/test/network/network').Network;
      page: ScoutPage;
    } & {
      validateTags: void;
    } & {
      perfTracker: import('../../fixtures/scope/test/performance/performance_tracker').PerformanceTracker;
    },
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      esArchiver: EsArchiverFixture;
    } & {
      linkedProject: LinkedProjectFixture;
    } & {
      uiSettings: UiSettingsFixture;
    } & {
      apiServices: ApiServicesFixture;
    } & {
      kbnUrl: KibanaUrl;
    } & {
      config: ScoutTestConfig;
    }
>;
export interface ScoutTestFixtures {
  browserAuth: BrowserAuthFixture;
  page: ScoutPage;
  pageObjects: PageObjects;
  network: NetworkFixture;
  perfTracker: PerfTrackerFixture;
}
export interface ScoutWorkerFixtures extends ApiServicesFixture {
  log: ScoutLogger;
  config: ScoutTestConfig;
  kbnUrl: KibanaUrl;
  kbnClient: KbnClient;
  esClient: EsClient;
  esArchiver: EsArchiverFixture;
  linkedProject: LinkedProjectFixture;
  uiSettings: UiSettingsFixture;
  apiServices: ApiServicesFixture;
  isSnapshotBuild: boolean;
}
export declare const lighthouseFixtures: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      context: import('playwright-core').BrowserContext;
    } & {
      browserAuth: BrowserAuthFixture;
    } & {
      page: ScoutPage;
      log: ScoutLogger;
    } & {
      pageObjects: PageObjects;
    } & {
      network: import('../../fixtures/scope/test/network/network').Network;
      page: ScoutPage;
    } & {
      validateTags: void;
    } & {
      perfTracker: import('../../fixtures/scope/test/performance/performance_tracker').PerformanceTracker;
    } & {
      context: import('playwright-core').BrowserContext;
    } & {
      lighthouse: import('../../fixtures/scope/worker').LighthouseFixture;
    },
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      esArchiver: EsArchiverFixture;
    } & {
      linkedProject: LinkedProjectFixture;
    } & {
      uiSettings: UiSettingsFixture;
    } & {
      apiServices: ApiServicesFixture;
    } & {
      kbnUrl: KibanaUrl;
    } & {
      config: ScoutTestConfig;
    } & {
      debuggingPort: number;
    } & {
      debuggingPort: number;
    }
>;
