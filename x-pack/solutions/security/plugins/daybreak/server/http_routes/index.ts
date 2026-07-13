/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RouteDependencies } from './types';
import { registerEvidenceRoutes } from './evidence';
import { registerProposalRoutes } from './proposals';
import { registerProposalActResponseRoutes } from './proposals_act_response';
import { registerWatchRoutes } from './watches';
import { registerWorkflowRoutes } from './workflows';
import { registerSeedDemoDataRoute } from './seed_demo_data';
import { registerConfigRoute } from './config';
import { registerAlertSummaryRoute } from './alert_summary';
import { registerAlertsTagFpRoute } from './alerts_tag_fp';
import { registerProposalsFromWorkerRoute } from './proposals_from_worker';
import { registerWorkerEvalRecordRoutes } from './worker_eval_records';
import { registerInvestigationRoutes } from './investigations';
import { registerSseRoutes } from './sse';

export const registerRoutes = (dependencies: RouteDependencies) => {
  registerProposalRoutes(dependencies);
  registerProposalActResponseRoutes(dependencies);
  registerEvidenceRoutes(dependencies);
  registerWatchRoutes(dependencies);
  registerWorkflowRoutes(dependencies);
  registerSeedDemoDataRoute(dependencies);
  registerConfigRoute(dependencies);
  registerAlertSummaryRoute(dependencies);
  registerAlertsTagFpRoute(dependencies);
  registerProposalsFromWorkerRoute(dependencies);
  registerWorkerEvalRecordRoutes(dependencies);
  registerInvestigationRoutes(dependencies);
  registerSseRoutes(dependencies);
};
