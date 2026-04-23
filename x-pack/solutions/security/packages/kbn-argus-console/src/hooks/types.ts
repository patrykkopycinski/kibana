/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';

/**
 * Minimal slice of core HTTP that the hooks need. Keeping the surface tight
 * makes it trivial to swap in a fixture-backed stub from Storybook or tests.
 */
export interface ArgusHttp {
  readonly fetch: HttpStart['fetch'];
}

export type FetchState<TData> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: TData }
  | { readonly status: 'error'; readonly error: Error };
