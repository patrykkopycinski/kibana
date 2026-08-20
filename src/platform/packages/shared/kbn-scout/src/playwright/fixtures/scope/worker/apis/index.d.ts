/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AlertingApiService } from './alerting';
import type { CasesApiService } from './cases';
import type { CoreApiService } from './core';
import type { DashboardApiService } from './dashboard';
import type { DataViewsApiService } from './data_views';
import type { FleetApiService } from './fleet';
import type { SampleDataApiService } from './sample_data';
import type { SavedObjectsApiService } from './saved_objects';
import type { SpacesApiService } from './spaces';
import type { StreamsApiService } from './streams';
import type { MlApiService } from './ml';
export interface ApiServicesFixture {
  alerting: AlertingApiService;
  cases: CasesApiService;
  dashboard: DashboardApiService;
  dataViews: DataViewsApiService;
  fleet: FleetApiService;
  ml: MlApiService;
  sampleData: SampleDataApiService;
  savedObjects: SavedObjectsApiService;
  spaces: SpacesApiService;
  streams: StreamsApiService;
  core: CoreApiService;
}
/**
 * This fixture provides a helper to interact with the Kibana APIs like Alerting, Cases, Fleet, Streams, Spaces, etc.
 */
export declare const apiServicesFixture: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('../core_fixtures').BaseWorkerFixtures & {
      apiServices: ApiServicesFixture;
    }
>;
