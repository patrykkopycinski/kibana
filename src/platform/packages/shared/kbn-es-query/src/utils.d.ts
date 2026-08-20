/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataViewFieldBase, IFieldSubTypeNested, IFieldSubTypeMulti } from './es_query';
/** @internal */
export declare function getTimeZoneFromSettings(dateFormatTZ: string): string;
type HasSubtype = Pick<DataViewFieldBase, 'subType'>;
export declare function isDataViewFieldSubtypeNested(field: HasSubtype): boolean;
export declare function getDataViewFieldSubtypeNested(
  field: HasSubtype
): IFieldSubTypeNested | undefined;
export declare function isDataViewFieldSubtypeMulti(field: HasSubtype): boolean;
export declare function getDataViewFieldSubtypeMulti(
  field: HasSubtype
): IFieldSubTypeMulti | undefined;
/**
 * Check whether the index expression represents a non-local index or not. This can happen in:
 * - CCS for a remote cluster
 * - CPS for a linked project
 * The index name is assumed to be individual index (no commas) but can contain `-`, wildcards,
 * datemath, remote cluster name and any other syntax permissible in index expression component.
 *
 * 2025/01/21 Implementation taken from https://github.com/smalyshev/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/transport/RemoteClusterAware.java
 *
 * @param indexExpression
 */
export declare function isNonLocalIndexName(indexExpression: string): boolean;
export {};
