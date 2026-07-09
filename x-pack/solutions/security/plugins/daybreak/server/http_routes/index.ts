/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RouteDependencies } from './types';
import { registerProposalRoutes } from './proposals';
import { registerEvidenceRoutes } from './evidence';

/**
 * Register all Daybreak HTTP routes that expose the PD-2 Evidence and Proposal
 * stores to the `public/` layer (FR-023).
 */
export const registerRoutes = (dependencies: RouteDependencies) => {
  registerProposalRoutes(dependencies);
  registerEvidenceRoutes(dependencies);
};
