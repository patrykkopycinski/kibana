/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { Filter } from '../filters';
import type { BoolQuery, DataViewBase } from './types';
/**
 * Options for building query for filters
 */
export interface EsQueryFiltersConfig {
  /**
   * by default filters that use fields that can't be found in the specified index pattern are not applied. Set this to true if you want to apply them anyway.
   */
  ignoreFilterIfFieldNotInIndex?: boolean;
  /**
   * the nested field type requires a special query syntax, which includes an optional ignore_unmapped parameter that indicates whether to ignore an unmapped path and not return any documents instead of an error.
   * The optional ignore_unmapped parameter defaults to false.
   * This `nestedIgnoreUnmapped` param allows creating queries with "ignore_unmapped": true
   */
  nestedIgnoreUnmapped?: boolean;
}
/**
 * @param filters
 * @param indexPattern
 * @param ignoreFilterIfFieldNotInIndex by default filters that use fields that can't be found in the specified index pattern are not applied. Set this to true if you want to apply them anyway.
 * @returns An EQL query
 *
 * @public
 */
export declare const buildQueryFromFilters: (
  inputFilters: Filter[] | undefined,
  inputDataViews: DataViewBase | DataViewBase[] | undefined,
  options?: EsQueryFiltersConfig
) => BoolQuery;
export declare function filterToQueryDsl(
  filter: Filter,
  inputDataViews: DataViewBase | DataViewBase[] | undefined,
  options?: EsQueryFiltersConfig
): estypes.QueryDslQueryContainer;
