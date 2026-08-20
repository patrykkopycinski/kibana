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
 * Returns true whether the given expression contains at least one free text expression (e.g. `foo: "bar" AND my_free_text_query`)
 */
export declare function getIsKqlFreeTextExpression(expression: string): boolean;
export declare function getIsKqlFreeText(node: KueryNode): boolean;
