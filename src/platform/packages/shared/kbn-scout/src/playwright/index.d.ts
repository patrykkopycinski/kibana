/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import './peggy_setup';
export { createPlaywrightConfig } from './config';
export { createLazyPageObject } from './page_objects/utils';
export { extendPlaywrightPage } from './fixtures/scope/test/scout_page/single_thread';
export { expect } from './matchers/ui';
export type { ScoutPlaywrightOptions, ScoutTestOptions } from './types';
export type { BrowserAuthFixture, ScoutPage, PageObjects } from './fixtures/scope/test';
export { browserAuthFixture } from './fixtures/scope/test';
export { networkFixture } from './fixtures/scope/test';
export type {
  ScoutTestFixtures,
  ScoutWorkerFixtures,
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from './test/ui';
export { coreWorkerFixtures, esArchiverFixture } from './fixtures/scope/worker';
export type { EsArchiverFixture } from './fixtures/scope/worker';
export type { NetworkFixture } from './fixtures/scope/test';
export { apiServicesFixture } from './fixtures/scope/worker/apis';
export type { ApiServicesFixture } from './fixtures/scope/worker/apis';
export { apiClientFixture } from './fixtures/scope/worker';
export type {
  LinkedProjectFixture,
  SamlAuth,
  RequestAuthFixture,
  ScoutSpaceParallelFixture,
  SpaceSolutionView,
  ApiClientFixture,
  ApiClientOptions,
  ApiClientResponse,
} from './fixtures/scope/worker';
export { tags } from './tags';
export { test, spaceTest, lighthouseTest, globalSetupHook, globalTeardownHook } from './test/ui';
export { apiTest } from './test/api';
export * from './eui_components';
export * from './ui_components';
export {
  ContentListWrapper,
  ListingTable,
  buildContentListSearch,
  buildContentListUrlRegex,
} from './page_objects';
export type { ContentListUrlState } from './page_objects';
