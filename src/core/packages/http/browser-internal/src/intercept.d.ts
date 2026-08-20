/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  HttpInterceptor,
  HttpResponse,
  HttpFetchOptionsWithPath,
} from '@kbn/core-http-browser';
import type { HttpInterceptController } from './http_intercept_controller';
export declare function interceptFetch(
  fetch: (fetchOptions: HttpFetchOptionsWithPath) => Promise<HttpResponse>,
  options: HttpFetchOptionsWithPath,
  interceptors: ReadonlySet<HttpInterceptor>,
  controller: HttpInterceptController
): Promise<HttpResponse>;
export declare function interceptRequest(
  options: HttpFetchOptionsWithPath,
  interceptors: ReadonlySet<HttpInterceptor>,
  controller: HttpInterceptController
): Promise<HttpFetchOptionsWithPath>;
export declare function interceptResponse(
  fetchOptions: HttpFetchOptionsWithPath,
  responsePromise: Promise<HttpResponse>,
  interceptors: ReadonlySet<HttpInterceptor>,
  controller: HttpInterceptController
): Promise<HttpResponse>;
