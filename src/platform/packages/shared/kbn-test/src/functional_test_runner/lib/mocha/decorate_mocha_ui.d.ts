/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * @param {import('../lifecycle').Lifecycle} lifecycle
 * @param {any} context
 * @param {{ rootTags?: string[], hookTimeout?: number, testTimeout?: number }} options
 */
export declare function decorateMochaUi(
  lifecycle: import('../lifecycle').Lifecycle,
  context: any,
  {
    rootTags,
    hookTimeout,
    testTimeout,
  }: {
    rootTags?: string[];
    hookTimeout?: number;
    testTimeout?: number;
  }
): any;
