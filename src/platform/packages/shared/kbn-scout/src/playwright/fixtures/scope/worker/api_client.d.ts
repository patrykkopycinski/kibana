/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Strips leading slashes from a URL path so that supertest concatenates it
 * correctly with the base URL (which already has a trailing slash from formatUrl).
 */
export declare const normalizePathSlashes: (path: string) => string;
export interface ApiClientOptions {
  headers?: Record<string, string>;
  responseType?: 'json' | 'text' | 'buffer';
  body?: any;
  /**
   * Pass an AbortSignal to cancel the request mid-flight.
   * @example
   * const controller = new AbortController();
   * const promise = apiClient.post(url, { signal: controller.signal, headers, body });
   * setTimeout(() => controller.abort(), 2000);
   * await expect(promise).rejects.toThrow();
   */
  signal?: AbortSignal;
}
export interface ApiClientResponse {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[]>;
  body: any;
}
export interface ApiClientFixture {
  get(url: string, options?: ApiClientOptions): Promise<ApiClientResponse>;
  post(url: string, options?: ApiClientOptions): Promise<ApiClientResponse>;
  put(url: string, options?: ApiClientOptions): Promise<ApiClientResponse>;
  delete(url: string, options?: ApiClientOptions): Promise<ApiClientResponse>;
  patch(url: string, options?: ApiClientOptions): Promise<ApiClientResponse>;
  head(url: string, options?: ApiClientOptions): Promise<ApiClientResponse>;
}
export declare const apiClientFixture: import('playwright/test').TestType<
  import('playwright/test').PlaywrightTestArgs & import('playwright/test').PlaywrightTestOptions,
  import('playwright/test').PlaywrightWorkerArgs &
    import('playwright/test').PlaywrightWorkerOptions &
    import('./core_fixtures').BaseWorkerFixtures & {
      samlAuth: import('./saml_auth').SamlAuth;
    } & {
      apiClient: ApiClientFixture;
    }
>;
