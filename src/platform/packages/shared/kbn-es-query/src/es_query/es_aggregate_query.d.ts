/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Query, AggregateQuery } from '../filters';
type Language = keyof AggregateQuery;
export declare function isOfQueryType(arg?: Query | AggregateQuery): arg is Query;
export declare function isOfAggregateQueryType(
  query?:
    | AggregateQuery
    | Query
    | {
        [key: string]: any;
      }
): query is AggregateQuery;
export declare function getAggregateQueryMode(query: AggregateQuery): Language;
export declare function getLanguageDisplayName(language?: string): string;
export {};
