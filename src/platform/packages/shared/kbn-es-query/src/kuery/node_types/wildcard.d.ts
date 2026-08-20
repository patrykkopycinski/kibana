/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KueryNode } from '..';
export declare const KQL_WILDCARD_SYMBOL = '@kuery-wildcard@';
export declare const KQL_NODE_TYPE_WILDCARD = 'wildcard';
export interface KqlWildcardNode extends KueryNode {
  type: typeof KQL_NODE_TYPE_WILDCARD;
  value: string;
}
export declare function isNode(node: KueryNode): node is KqlWildcardNode;
export declare function isMatchAll(node: KqlWildcardNode): boolean;
export declare function buildNode(value: string): KqlWildcardNode;
export declare function test(node: KqlWildcardNode, str: string): boolean;
export declare function toElasticsearchQuery(node: KqlWildcardNode): string;
export declare function toQueryStringQuery(node: KqlWildcardNode): string;
export declare function isLoneWildcard({ value }: KqlWildcardNode): boolean;
export declare function hasLeadingWildcard(node: KqlWildcardNode): boolean;
export declare function toKqlExpression(node: KqlWildcardNode): string;
