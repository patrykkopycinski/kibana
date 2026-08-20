/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JsonObject } from '@kbn/utility-types';
import type { estypes } from '@elastic/elasticsearch';
import type { KqlContext, KueryNode, KueryParseOptions, KueryQueryOptions } from '../types';
import type { DataViewBase } from '../../..';
export declare const fromLiteralExpression: (
  expression: string | estypes.QueryDslQueryContainer,
  parseOptions?: Partial<KueryParseOptions>
) => KueryNode;
/**
 * @throws an exception is thrown when this function receives malformed input.
 */
export declare const fromKueryExpression: (
  expression: string | NonNullable<estypes.QueryDslQueryContainer>,
  parseOptions?: Partial<KueryParseOptions>
) => KueryNode;
/**
 * Given a KQL AST node, generate the corresponding KQL expression.
 * @public
 * @param node
 */
export declare function toKqlExpression(node: KueryNode): string;
/**
 * @params {String} indexPattern
 * @params {Object} config - contains the dateFormatTZ
 *
 * IndexPattern isn't required, but if you pass one in, we can be more intelligent
 * about how we craft the queries (e.g. scripted fields)
 *
 */
export declare const toElasticsearchQuery: (
  node: KueryNode,
  indexPattern?: DataViewBase,
  config?: KueryQueryOptions,
  context?: KqlContext
) => JsonObject;
