/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Context, Span, SpanOptions, Tracer } from '@opentelemetry/api';
export interface WithActiveSpanOptions extends SpanOptions {
  tracer?: Tracer;
}
export type WithActiveSpanWithContext = <T>(
  name: string,
  opts: WithActiveSpanOptions,
  ctx: Context,
  cb: (span?: Span) => T
) => T;
export interface WithActiveSpan extends WithActiveSpanWithContext {
  <T>(name: string, cb: (span?: Span) => T): T;
  <T>(name: string, opts: WithActiveSpanOptions, cb: (span?: Span) => T): T;
}
export type WithActiveSpanAsUnion<T = unknown> =
  | ((name: string, cb: (span?: Span) => T) => T)
  | ((name: string, opts: WithActiveSpanOptions, cb: (span?: Span) => T) => T)
  | ((name: string, opts: WithActiveSpanOptions, ctx: Context, cb: (span?: Span) => T) => T);
export declare function withActiveSpan<T>(name: string, cb: (span?: Span) => T): T;
export declare function withActiveSpan<T>(
  name: string,
  opts: WithActiveSpanOptions,
  cb: (span?: Span) => T
): T;
export declare function withActiveSpan<T>(
  name: string,
  opts: WithActiveSpanOptions,
  ctx: Context,
  cb: (span?: Span) => T
): T;
