/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SpaceSolutionView } from '../../scout_space';
import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface SpacesApiService {
  create: (space: {
    id: string;
    name?: string;
    disabledFeatures?: string[];
    /** Cross-project search default NPRE for the space (serverless CPS). */
    projectRouting?: string;
  }) => Promise<void>;
  get: (id: string) => Promise<{
    id: string;
    name: string;
    projectRouting?: string;
  }>;
  delete: (id: string) => Promise<void>;
  setSolutionView: (params: { id: string; solution: SpaceSolutionView }) => Promise<void>;
  resetViewToClassic: (id: string) => Promise<void>;
}
export declare const getSpacesApiHelper: (
  log: ScoutLogger,
  kbnClient: KbnClient
) => SpacesApiService;
