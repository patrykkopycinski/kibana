/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type KueryNode } from '..';
export declare const KQL_NODE_TYPE_LITERAL = 'literal';
export type KqlLiteralType = null | boolean | number | string;
export interface KqlLiteralNode extends KueryNode {
  type: typeof KQL_NODE_TYPE_LITERAL;
  value: KqlLiteralType;
  isQuoted: boolean;
}
export declare function isNode(node: KueryNode): node is KqlLiteralNode;
export declare function buildNode(value: KqlLiteralType, isQuoted?: boolean): KqlLiteralNode;
export declare function toElasticsearchQuery(node: KqlLiteralNode): KqlLiteralType;
export declare function toKqlExpression(node: KqlLiteralNode): string;
