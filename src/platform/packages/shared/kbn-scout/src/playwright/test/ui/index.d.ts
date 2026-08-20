/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const test: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      context: import('playwright-core').BrowserContext;
    } & {
      browserAuth: import('./single_thread_fixtures').BrowserAuthFixture;
    } & {
      page: import('./single_thread_fixtures').ScoutPage;
      log: import('../../../common').ScoutLogger;
    } & {
      pageObjects: import('./single_thread_fixtures').PageObjects;
    } & {
      network: import('../../fixtures/scope/test/network/network').Network;
      page: import('./single_thread_fixtures').ScoutPage;
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
      esArchiver: import('../..').EsArchiverFixture;
    } & {
      linkedProject: import('../..').LinkedProjectFixture;
    } & {
      uiSettings: import('../../fixtures/scope/worker').UiSettingsFixture;
    } & {
      apiServices: import('./single_thread_fixtures').ApiServicesFixture;
    } & {
      kbnUrl: import('../../../common').KibanaUrl;
    } & {
      config: import('../../../types').ScoutTestConfig;
    }
>;
export declare const lighthouseTest: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      context: import('playwright-core').BrowserContext;
    } & {
      browserAuth: import('./single_thread_fixtures').BrowserAuthFixture;
    } & {
      page: import('./single_thread_fixtures').ScoutPage;
      log: import('../../../common').ScoutLogger;
    } & {
      pageObjects: import('./single_thread_fixtures').PageObjects;
    } & {
      network: import('../../fixtures/scope/test/network/network').Network;
      page: import('./single_thread_fixtures').ScoutPage;
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
      esArchiver: import('../..').EsArchiverFixture;
    } & {
      linkedProject: import('../..').LinkedProjectFixture;
    } & {
      uiSettings: import('../../fixtures/scope/worker').UiSettingsFixture;
    } & {
      apiServices: import('./single_thread_fixtures').ApiServicesFixture;
    } & {
      kbnUrl: import('../../../common').KibanaUrl;
    } & {
      config: import('../../../types').ScoutTestConfig;
    } & {
      debuggingPort: number;
    } & {
      debuggingPort: number;
    }
>;
export declare const spaceTest: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      context: import('playwright-core').BrowserContext;
    } & {
      browserAuth: import('./single_thread_fixtures').BrowserAuthFixture;
    } & {
      page: import('./single_thread_fixtures').ScoutPage;
    } & {
      pageObjects: import('./single_thread_fixtures').PageObjects;
    } & {
      network: import('../../fixtures/scope/test/network/network').Network;
      page: import('./single_thread_fixtures').ScoutPage;
    } & {
      validateTags: void;
    },
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      scoutSpace: import('../..').ScoutSpaceParallelFixture;
    } & {
      apiServices: import('./single_thread_fixtures').ApiServicesFixture;
    } & {
      log: import('../../../common').ScoutLogger;
      kbnUrl: import('../../../common').KibanaUrl;
      scoutSpace: import('../..').ScoutSpaceParallelFixture;
    } & {
      scoutSpace: import('../..').ScoutSpaceParallelFixture;
      config: import('../../../types').ScoutTestConfig;
    }
>;
export declare const globalSetupHook: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      esArchiver: import('../..').EsArchiverFixture;
    } & {
      apiServices: import('./single_thread_fixtures').ApiServicesFixture;
    }
>;
export declare const globalTeardownHook: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../fixtures/scope/worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../..').SamlAuth;
    } & {
      apiServices: import('./single_thread_fixtures').ApiServicesFixture;
    }
>;
export type { ScoutTestFixtures, ScoutWorkerFixtures } from './single_thread_fixtures';
export type {
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from './parallel_run_fixtures';
