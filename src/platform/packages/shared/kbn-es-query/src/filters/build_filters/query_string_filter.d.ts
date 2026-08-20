/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Filter, FilterMeta } from './types';
export type QueryStringFilterMeta = FilterMeta;
export type QueryStringFilter = Filter & {
  meta: QueryStringFilterMeta;
  query?: {
    query_string?: {
      query: string;
      fields?: string[];
    };
  };
};
/**
 * @param filter
 * @returns `true` if a filter is a `QueryStringFilter`
 *
 * @public
 */
export declare const isQueryStringFilter: (filter: Filter) => filter is QueryStringFilter;
/**
 * Creates a filter corresponding to a raw Elasticsearch query DSL object
 * @param query
 * @param index
 * @param alias
 * @returns `QueryStringFilter`
 *
 * @public
 */
export declare const buildQueryFilter: (
  query: QueryStringFilter['query'],
  index: string,
  alias?: string,
  meta?: QueryStringFilterMeta
) => {
  query:
    | (Record<string, any> & {
        query_string?: {
          query: string;
          fields?: string[];
        };
      })
    | undefined;
  meta: {
    disabled?: boolean;
    negate?: boolean;
    controlledBy?: string;
    group?: string;
    isMultiIndex?: boolean;
    type?: string;
    key?: string;
    params?: import('./types').FilterMetaParams;
    value?:
      | string
      | import('./range_filter').RangeFilterParams
      | import('./phrase_filter').PhraseFilterValue[];
    index: string;
    alias: string | null | undefined;
  };
};
