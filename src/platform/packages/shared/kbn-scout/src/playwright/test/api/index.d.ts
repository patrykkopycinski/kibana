/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TestType } from 'playwright/test';
import type {
  CoreWorkerFixtures,
  EsArchiverFixture,
  LinkedProjectFixture,
  RequestAuthFixture,
  ApiClientFixture,
  DefaultRolesFixture,
  ApiServicesFixture,
} from '../../fixtures/scope/worker';
/**
 * Minimal set of fixtures for API tests.
 */
export interface ApiWorkerFixtures extends CoreWorkerFixtures {
  apiClient: ApiClientFixture;
  apiServices: ApiServicesFixture;
  defaultRolesFixture: DefaultRolesFixture;
  requestAuth: RequestAuthFixture;
  esArchiver: EsArchiverFixture;
  linkedProject: LinkedProjectFixture;
}
/**
 * API test type with minimal fixtures.
 * This is used for Scout api tests that do not require browser interaction.
 */
export declare const apiTest: TestType<{}, ApiWorkerFixtures>;
