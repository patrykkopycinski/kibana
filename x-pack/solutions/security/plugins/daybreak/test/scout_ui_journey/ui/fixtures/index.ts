/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SecurityPageObjects,
  SecurityTestFixtures,
  SecurityWorkerFixtures,
} from '@kbn/scout-security';
import { test as baseTest, createLazyPageObject } from '@kbn/scout-security';
import { DaybreakApp } from './page_objects';

export interface ExtScoutTestFixtures extends SecurityTestFixtures {
  pageObjects: SecurityPageObjects & {
    daybreak: DaybreakApp;
  };
}

export const test = baseTest.extend<ExtScoutTestFixtures, SecurityWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: ExtScoutTestFixtures['pageObjects'];
      page: ExtScoutTestFixtures['page'];
    },
    use: (pageObjects: ExtScoutTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      daybreak: createLazyPageObject(DaybreakApp, page),
    });
  },
});

export * as testData from './constants';
