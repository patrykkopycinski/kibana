/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FilterStateStore } from '@kbn/es-query-constants';
import type { ExistsFilter } from './exists_filter';
import type { PhrasesFilter, PhrasesFilterMeta } from './phrases_filter';
import type {
  PhraseFilter,
  PhraseFilterMeta,
  PhraseFilterMetaParams,
  PhraseFilterValue,
} from './phrase_filter';
import type { RangeFilter, RangeFilterMeta, RangeFilterParams } from './range_filter';
import type { MatchAllFilter, MatchAllFilterMeta } from './match_all_filter';
/**
 * A common type for filters supported by this package
 * @public
 **/
export type FieldFilter =
  | ExistsFilter
  | PhraseFilter
  | PhrasesFilter
  | RangeFilter
  | MatchAllFilter;
/**
 * An enum of all types of filters supported by this package
 * @public
 */
export declare enum FILTERS {
  CUSTOM = 'custom',
  PHRASES = 'phrases',
  PHRASE = 'phrase',
  EXISTS = 'exists',
  MATCH_ALL = 'match_all',
  QUERY_STRING = 'query_string',
  RANGE = 'range',
  RANGE_FROM_VALUE = 'range_from_value',
  SPATIAL_FILTER = 'spatial_filter',
  COMBINED = 'combined',
}
export type FilterMetaParams =
  | Filter
  | Filter[]
  | RangeFilterMeta
  | RangeFilterParams
  | PhraseFilterMeta
  | PhraseFilterMetaParams
  | PhrasesFilterMeta
  | MatchAllFilterMeta
  | string
  | string[]
  | boolean
  | boolean[]
  | number
  | number[];
export interface FilterMeta {
  alias?: string | null;
  disabled?: boolean;
  negate?: boolean;
  controlledBy?: string;
  group?: string;
  index?: string;
  isMultiIndex?: boolean;
  type?: string;
  key?: string;
  params?: FilterMetaParams;
  value?: string | RangeFilterParams | PhraseFilterValue[];
}
export interface Filter {
  $state?: {
    store: FilterStateStore;
  };
  meta: FilterMeta;
  query?: Record<string, any>;
}
export interface Query {
  query:
    | string
    | {
        [key: string]: any;
      };
  language: string;
}
export interface AggregateQuery {
  esql: string;
}
/**
 * An interface for a latitude-longitude pair
 * @public
 */
export interface LatLon {
  lat: number;
  lon: number;
}
