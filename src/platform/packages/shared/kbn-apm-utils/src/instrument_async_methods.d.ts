/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SpanOptions } from './with_span';
/**
 * Wrap each async method on a class instance or plain object in a withSpan() call using the method name.
 * Mutates the target (and its prototype chain) in-place.
 */
export declare function instrumentAsyncMethods(
  name: string,
  instance: object,
  getSpanOptions?: (prevSpanOptions: SpanOptions) => SpanOptions
): void;
