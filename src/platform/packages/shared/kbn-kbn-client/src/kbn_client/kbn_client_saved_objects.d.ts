/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { SavedObjectsFindResponse } from '@kbn/core-saved-objects-api-server';
import type { KbnClientRequester } from './kbn_client_requester';
type MigrationVersion = Record<string, string>;
interface Reference {
  id: string;
  name: string;
  type: string;
}
interface SavedObjectResponse<Attributes extends Record<string, any>> {
  attributes: Attributes;
  id: string;
  migrationVersion?: MigrationVersion;
  references: Reference[];
  type: string;
  updated_at?: string;
  version?: string;
}
interface FindOptions {
  type: string;
  space?: string;
}
interface GetOptions {
  type: string;
  id: string;
  space?: string;
}
interface IndexOptions<Attributes> {
  type: string;
  attributes: Attributes;
  id?: string;
  overwrite?: boolean;
  migrationVersion?: MigrationVersion;
  references?: Reference[];
  space?: string;
}
interface UpdateOptions<Attributes> extends IndexOptions<Attributes> {
  id: string;
}
interface MigrateResponse {
  success: boolean;
  result: Array<{
    status: string;
  }>;
}
interface CleanOptions {
  space?: string;
  types: string[];
}
interface DeleteObjectsOptions {
  space?: string;
  objects: Array<{
    type: string;
    id: string;
  }>;
}
/**
 * SO client for FTR.
 *
 * @remarks: Leverage the `ftrApis` plugin under the hood.
 */
export declare class KbnClientSavedObjects {
  private readonly log;
  private readonly requester;
  constructor(log: ToolingLog, requester: KbnClientRequester);
  /**
   * Run the saved objects migration
   */
  migrate(): Promise<MigrateResponse>;
  /**
   * Get an object
   */
  get<Attributes extends Record<string, any>>(
    options: GetOptions
  ): Promise<SavedObjectResponse<Attributes>>;
  /**
   * Find saved objects
   */
  find<Attributes extends Record<string, any>>(
    options: FindOptions
  ): Promise<SavedObjectsFindResponse<Attributes, unknown>>;
  private buildCreatePath;
  /**
   * Create a saved object
   */
  create<Attributes extends Record<string, any>>(
    options: IndexOptions<Attributes>
  ): Promise<SavedObjectResponse<Attributes>>;
  /**
   * Update a saved object
   */
  update<Attributes extends Record<string, any>>(
    options: UpdateOptions<Attributes>
  ): Promise<SavedObjectResponse<Attributes>>;
  /**
   * Delete an object
   */
  delete(options: GetOptions): Promise<unknown>;
  clean(options: CleanOptions): Promise<void>;
  cleanStandardList(options?: { space?: string }): Promise<void>;
  bulkDelete(options: DeleteObjectsOptions): Promise<{
    deleted: number;
    missing: number;
  }>;
}
export {};
