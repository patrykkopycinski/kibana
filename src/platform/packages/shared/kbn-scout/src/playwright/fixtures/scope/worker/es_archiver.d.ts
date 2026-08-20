/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LoadActionPerfOptions } from '@kbn/es-archiver';
import type { IndexStats } from '@kbn/es-archiver/src/lib/stats';
export interface EsArchiverFixture {
  /**
   * Loads an Elasticsearch archive if the specified data index is not present.
   * @param name The name of the archive to load.
   * @param performance An object of type LoadActionPerfOptions to measure and
   * report performance metrics during the load operation.
   * @returns A Promise that resolves to an object containing index statistics.
   */
  loadIfNeeded: (
    name: string,
    performance?: LoadActionPerfOptions | undefined
  ) => Promise<Record<string, IndexStats>>;
}
export declare const esArchiverFixture: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('./core_fixtures').BaseWorkerFixtures & {
      esArchiver: EsArchiverFixture;
    }
>;
