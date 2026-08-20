/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KueryNode } from '../../..';
/**
 * @param expression
 * @throws an exception is thrown when this function receives malformed or unsupported input.
 */
export declare function getKqlFieldNamesFromExpression(expression: string): string[];
/**
 * @throws an exception is thrown when this function receives a `node.type` or `node.function` that is
 * not supported.
 */
export declare function getKqlFieldNames(node: KueryNode): string[];
