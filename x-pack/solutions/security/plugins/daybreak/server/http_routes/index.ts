/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RouteDependencies } from './types';
import { registerEvidenceRoutes } from './evidence';
import { registerProposalRoutes } from './proposals';
import { registerWatchRoutes } from './watches';
import { registerWorkflowRoutes } from './workflows';
import { registerSeedDemoDataRoute } from './seed_demo_data';

export const registerRoutes = (dependencies: RouteDependencies) => {
  registerProposalRoutes(dependencies);
  registerEvidenceRoutes(dependencies);
  registerWatchRoutes(dependencies);
  registerWorkflowRoutes(dependencies);
  registerSeedDemoDataRoute(dependencies);
  registerProposalsFromWorkerRoute(dependencies);
};
