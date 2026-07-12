/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger, KibanaRequest, RouteSecurity } from '@kbn/core/server';

export const daybreakRouteSecurity: RouteSecurity = {
  authz: {
    enabled: false,
    reason:
      'Daybreak is an experimental plugin behind a default-off flag; the Kibana-owned stores are accessed via the internal ES user.',
  },
};

export interface RouteDependencies {
  router: IRouter;
  logger: Logger;
  getSpaceId: (request: KibanaRequest) => string;
  executeAlertAnalysisWorker?: (request: KibanaRequest) => Promise<string>;
}
