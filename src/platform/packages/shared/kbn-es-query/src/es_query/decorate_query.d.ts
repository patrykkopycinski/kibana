/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { SerializableRecord } from '@kbn/utility-types';
/**
 * Decorate queries with default parameters
 * @param query object
 * @param queryStringOptions query:queryString:options from UI settings
 * @param dateFormatTZ dateFormat:tz from UI settings
 * @returns {object}
 *
 * @public
 */
export declare function decorateQuery(
  query: estypes.QueryDslQueryContainer,
  queryStringOptions: SerializableRecord | string,
  dateFormatTZ?: string
): estypes.QueryDslQueryContainer;
