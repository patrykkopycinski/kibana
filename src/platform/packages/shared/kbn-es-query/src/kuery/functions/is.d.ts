/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { DataViewBase, KueryQueryOptions } from '../../..';
import type { KqlFunctionNode, KqlLiteralNode, KqlWildcardNode } from '../node_types';
import type { KqlContext } from '../types';
export declare const KQL_FUNCTION_IS = 'is';
export interface KqlIsFunctionNode extends KqlFunctionNode {
  function: typeof KQL_FUNCTION_IS;
  arguments: [KqlLiteralNode | KqlWildcardNode, KqlLiteralNode | KqlWildcardNode];
}
export declare function isNode(node: KqlFunctionNode): node is KqlIsFunctionNode;
export declare function buildNodeParams(
  fieldName: string,
  value: any
): {
  arguments: import('..').KueryNode[];
};
export declare function toElasticsearchQuery(
  node: KqlIsFunctionNode,
  indexPattern?: DataViewBase,
  config?: KueryQueryOptions,
  context?: KqlContext
): QueryDslQueryContainer;
export declare function toKqlExpression(node: KqlIsFunctionNode): string;
