/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataViewFieldBase } from '../../es_query';
/**
 * @internal
 * See issues bellow for the reason behind this change.
 * Values need to be converted to correct types for boolean \ numeric fields.
 * https://github.com/elastic/kibana/issues/74301
 * https://github.com/elastic/kibana/issues/8677
 * https://github.com/elastic/elasticsearch/issues/20941
 * https://github.com/elastic/elasticsearch/pull/22201
 **/
export declare const getConvertedValueForField: (
  field: DataViewFieldBase,
  value: string | boolean | number
) => string | number | boolean;
