/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FilterStateStore } from '@kbn/es-query-constants';
import type { Filter, FilterMeta } from './types';
import type { FILTERS } from './types';
import type { DataViewBase } from '../../es_query';
/**
 * @public
 */
export declare enum BooleanRelation {
  AND = 'AND',
  OR = 'OR',
}
/**
 * @public
 */
export interface CombinedFilterMeta extends FilterMeta {
  type: typeof FILTERS.COMBINED;
  relation: BooleanRelation;
  params: Filter[];
}
/**
 * @public
 */
export interface CombinedFilter extends Filter {
  meta: CombinedFilterMeta;
}
/**
 * @public
 */
export declare function isCombinedFilter(filter: Filter): filter is CombinedFilter;
/**
 * Builds an COMBINED filter. An COMBINED filter is a filter with multiple sub-filters. Each sub-filter (FilterItem)
 * represents a condition.
 * @param relation The type of relation with which to combine the filters (AND/OR)
 * @param filters An array of sub-filters
 * @public
 */
export declare function buildCombinedFilter(
  relation: BooleanRelation,
  filters: Filter[],
  indexPattern: Pick<DataViewBase, 'id'>,
  disabled?: FilterMeta['disabled'],
  negate?: FilterMeta['negate'],
  alias?: FilterMeta['alias'],
  store?: FilterStateStore
): CombinedFilter;
