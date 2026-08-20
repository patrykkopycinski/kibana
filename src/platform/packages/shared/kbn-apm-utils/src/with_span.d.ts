/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from 'elastic-apm-node';
import type agent from 'elastic-apm-node';
export interface SpanOptions {
  name: string;
  type?: string;
  subtype?: string;
  labels?: Record<string, string>;
  intercept?: boolean;
}
type Span = Exclude<typeof agent.currentSpan, undefined | null>;
export declare function parseSpanOptions(optionsOrName: SpanOptions | string): SpanOptions;
export declare function withSpan<T>(
  optionsOrName: SpanOptions | string,
  cb: (span?: Span) => Promise<T>,
  logger?: Logger
): Promise<T>;
export { instrumentAsyncMethods } from './instrument_async_methods';
