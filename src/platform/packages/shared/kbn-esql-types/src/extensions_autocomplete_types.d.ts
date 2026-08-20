/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaProject } from '@kbn/projects-solutions-groups';
/**
 * Identifier for the classic (non-solution) view.
 * Items registered under this ID are visible in all views, regardless of the active solution.
 */
export declare const ESQL_CLASSIC_SOLUTION_ID: 'classic';
/**
 * Extended solution ID type used by the extensions registry.
 * Includes the standard Kibana solution project types plus 'classic'
 * for items that should be available outside of (and across) all solutions.
 */
export type ESQLRegistrySolutionId = KibanaProject | typeof ESQL_CLASSIC_SOLUTION_ID;
export interface RecommendedQuery {
  name: string;
  query: string;
  description?: string;
  isStandalone?: boolean;
}
export interface RecommendedField {
  name: string;
  pattern: string;
}
