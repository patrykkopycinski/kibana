/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

type StorageType = 'local' | 'session';
/** Storage helper with key namespacing and JSON serialization */
export declare class StorageHelper {
  private readonly keyPrefix;
  constructor(keyPrefix: string);
  private getKey;
  set<T>(key: string, value: T, storageType?: StorageType): void;
  get<T>(key: string, storageType?: StorageType): T | null;
}
export {};
