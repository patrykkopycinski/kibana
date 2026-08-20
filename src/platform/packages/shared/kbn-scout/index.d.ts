/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export * as cli from './src/cli';
export {
  test,
  spaceTest,
  lighthouseTest,
  apiTest,
  globalSetupHook,
  globalTeardownHook,
  tags,
} from './src/playwright';
export {
  browserAuthFixture,
  apiServicesFixture,
  apiClientFixture,
  coreWorkerFixtures,
  esArchiverFixture,
  networkFixture,
  createPlaywrightConfig,
  createLazyPageObject,
  extendPlaywrightPage,
} from './src/playwright';
export { mergeTests, test as playwrightTest } from 'playwright/test';
export { measurePerformance, measurePerformanceAsync } from './src/common';
export * from './src/playwright/eui_components';
export * from './src/playwright/ui_components';
export {
  ContentListWrapper,
  DataGrid,
  DiscoverApp,
  FilterBar,
  LensApp,
  QueryBar,
  UnifiedTabs,
  buildContentListSearch,
  buildContentListUrlRegex,
  ListingTable,
} from './src/playwright/page_objects';
export type { ContentListUrlState } from './src/playwright/page_objects';
export type {
  ScoutPlaywrightOptions,
  ScoutTestOptions,
  ScoutPage,
  PageObjects,
  ScoutTestFixtures,
  ScoutWorkerFixtures,
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from './src/playwright';
export type {
  ApiServicesFixture,
  ApiClientFixture,
  ApiClientOptions,
  ApiClientResponse,
  BrowserAuthFixture,
  NetworkFixture,
  RequestAuthFixture,
  SamlAuth,
  ScoutSpaceParallelFixture,
  SpaceSolutionView,
} from './src/playwright';
export type {
  EsClient,
  KbnClient,
  KibanaUrl,
  ScoutLogger,
  ScoutServerConfig,
  ScoutTestConfig,
  ServerlessProductTier,
  KibanaRole,
  ElasticsearchRoleDescriptor,
} from './src/types';
export type { RoleApiCredentials } from './src/playwright/fixtures/scope/worker/api_key';
export type {
  RoleSessionCredentials,
  CookieHeader,
} from './src/playwright/fixtures/scope/worker/core_fixtures';
export type { Locator, CDPSession } from 'playwright/test';
export { AUDIT_LOG_PATH } from './src/servers/configs/config_sets/security_audit/shared';
export {
  OTEL_RECEIVER_PORT,
  OTEL_TEST_PROJECT_ID,
} from './src/servers/configs/config_sets/security_audit_otel/shared';
