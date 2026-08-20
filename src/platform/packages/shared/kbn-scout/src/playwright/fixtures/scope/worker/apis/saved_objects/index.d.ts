/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface SavedObjectReference {
  name: string;
  type: string;
  id: string;
}
export interface CreateSavedObjectParams<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> {
  type: string;
  id?: string;
  attributes: TAttributes;
  references?: SavedObjectReference[];
  initialNamespaces?: string[];
  typeMigrationVersion?: string;
  migrationVersion?: Record<string, string>;
  spaceId?: string;
}
export interface SavedObjectResponse<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> {
  id: string;
  type: string;
  attributes: TAttributes;
  references: SavedObjectReference[];
  namespaces?: string[];
  typeMigrationVersion?: string;
  migrationVersion?: Record<string, string>;
  version?: string;
  updated_at?: string;
}
export interface SavedObjectApiResponse<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> {
  data: SavedObjectResponse<TAttributes>;
  status: number;
}
export interface SavedObjectsApiService {
  create: <TAttributes extends Record<string, unknown>>(
    params: CreateSavedObjectParams<TAttributes>
  ) => Promise<SavedObjectApiResponse<TAttributes>>;
}
export declare const getSavedObjectsApiHelper: (
  log: ScoutLogger,
  kbnClient: KbnClient
) => SavedObjectsApiService;
