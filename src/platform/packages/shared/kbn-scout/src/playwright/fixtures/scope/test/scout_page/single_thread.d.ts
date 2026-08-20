/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Page } from '@playwright/test';
import type { ScoutPage } from '.';
import type { KibanaUrl, ScoutLogger } from '../../worker';
export declare function extendPlaywrightPage({
  page,
  kbnUrl,
}: {
  page: Page;
  kbnUrl: KibanaUrl;
}): ScoutPage;
/**
 * Extends the 'page' fixture with Kibana-specific functionality
 *
 * 1. Allow calling methods with simplified 'data-test-subj' selectors.
 * Instead of manually constructing 'data-test-subj' selectors, this extension provides a `testSubj` object on the page
 * Supported methods include `click`, `check`, `fill`, and others that interact with `data-test-subj`.
 *
 * Example Usage:
 *
 * ```typescript
 * // Without `testSubj` extension:
 * await page.locator('[data-test-subj="foo"][data-test-subj="bar"]').click();
 *
 * // With `testSubj` extension:
 * await page.testSubj.click('foo & bar');
 * ```
 *
 * 2. Navigate to Kibana apps by using 'kbnUrl' fixture
 *
 * Example Usage:
 *
 * ```typescript
 * // Navigate to '/app/discover'
 * await page.gotoApp('discover);
 * ```
 */
export declare const scoutPageFixture: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      page: ScoutPage;
      log: ScoutLogger;
    },
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions & {
      kbnUrl: KibanaUrl;
    }
>;
