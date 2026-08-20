/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type ProviderConstructor = new (...args: any[]) => any;
export type ProviderFactory = (...args: any[]) => any;
export declare function isProviderConstructor(x: unknown): x is ProviderConstructor;
export type ProviderFn = ProviderConstructor | ProviderFactory;
export type Providers = ReturnType<typeof readProviderSpec>;
export type Provider = Providers extends Array<infer X> ? X : unknown;
export declare function readProviderSpec(
  type: string,
  providers: Record<string, ProviderFn>
): {
  type: string;
  name: string;
  fn: ProviderFn;
}[];
