/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { type KqlFunctionNode, type KqlLiteralNode } from '../node_types';
import type { RangeFilterParams } from '../../filters';
import type { DataViewBase, KueryQueryOptions } from '../../..';
import type { KqlContext } from '../types';
export declare const KQL_FUNCTION_RANGE = 'range';
export declare const KQL_RANGE_OPERATOR_MAP: {
  gt: string;
  gte: string;
  lt: string;
  lte: string;
};
export interface KqlRangeFunctionNode extends KqlFunctionNode {
  function: typeof KQL_FUNCTION_RANGE;
  arguments: [
    KqlLiteralNode,
    keyof Pick<RangeFilterParams, 'gt' | 'gte' | 'lt' | 'lte'>,
    KqlLiteralNode
  ];
}
export declare function isNode(node: KqlFunctionNode): node is KqlRangeFunctionNode;
export declare function buildNodeParams(
  fieldName: string,
  operator: keyof Pick<RangeFilterParams, 'gt' | 'gte' | 'lt' | 'lte'>,
  value: number | string
): {
  arguments: ('gt' | 'gte' | 'lt' | 'lte' | import('..').KueryNode)[];
};
export declare function toElasticsearchQuery(
  node: KqlRangeFunctionNode,
  indexPattern?: DataViewBase,
  config?: KueryQueryOptions,
  context?: KqlContext
): QueryDslQueryContainer;
export declare function toKqlExpression(node: KqlRangeFunctionNode): string;
