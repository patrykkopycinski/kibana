/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { Filter, FilterMeta } from './types';
import type { PhraseFilterValue } from './phrase_filter';
import type { DataViewFieldBase, DataViewBaseNoFields } from '../../es_query';
export type PhrasesFilterMeta = FilterMeta & {
  params: PhraseFilterValue[];
  field?: string;
};
export type PhrasesFilter = Filter & {
  meta: PhrasesFilterMeta;
  query: estypes.QueryDslQueryContainer;
};
/**
 * @param filter
 * @returns `true` if a filter is a `PhrasesFilter`
 *
 * @public
 */
export declare const isPhrasesFilter: (filter: Filter) => filter is PhrasesFilter;
/** @internal */
export declare const getPhrasesFilterField: (filter: PhrasesFilter) => string | undefined;
/**
 * Creates a filter where the given field matches one or more of the given values
 * params should be an array of values
 * @param field
 * @param params
 * @param indexPattern
 * @returns
 *
 * @public
 */
export declare const buildPhrasesFilter: (
  field: DataViewFieldBase,
  params: PhraseFilterValue[],
  indexPattern: DataViewBaseNoFields
) => PhrasesFilter;
