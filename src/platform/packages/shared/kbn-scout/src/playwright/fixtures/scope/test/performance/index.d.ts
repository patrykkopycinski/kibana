/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PerformanceTracker } from './performance_tracker';
export declare const perfTrackerFixture: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs &
    import('playwright/test').PlaywrightTestOptions & {
      perfTracker: PerformanceTracker;
    },
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../../worker/core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('../../worker').SamlAuth;
    }
>;
export type PerfTrackerFixture = ReturnType<typeof perfTrackerFixture>;
