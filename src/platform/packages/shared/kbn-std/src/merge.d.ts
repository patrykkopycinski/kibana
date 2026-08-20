/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Deeply merges two objects, omitting undefined values, and not deeply merging Arrays.
 *
 * @remarks
 * Should behave identically to lodash.merge, however it will not merge Array values like lodash does.
 * Any properties with `undefined` values on both objects will be ommitted from the returned object.
 */
export declare function merge<
  TBase extends Record<string, any>,
  TSource1 extends Record<string, any>
>(baseObj: TBase, source1: TSource1): TBase & TSource1;
export declare function merge<
  TBase extends Record<string, any>,
  TSource1 extends Record<string, any>,
  TSource2 extends Record<string, any>
>(baseObj: TBase, overrideObj: TSource1, overrideObj2: TSource2): TBase & TSource1 & TSource2;
export declare function merge<
  TBase extends Record<string, any>,
  TSource1 extends Record<string, any>,
  TSource2 extends Record<string, any>,
  TSource3 extends Record<string, any>
>(
  baseObj: TBase,
  overrideObj: TSource1,
  overrideObj2: TSource2
): TBase & TSource1 & TSource2 & TSource3;
