/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ExecutionContextSetup } from '@kbn/core-execution-context-browser';
import type { IBasePath, HttpInterceptor, HttpHandler } from '@kbn/core-http-browser';
interface Params {
  basePath: IBasePath;
  kibanaVersion: string;
  buildNumber: number;
  executionContext: ExecutionContextSetup;
}
export declare class Fetch {
  private readonly params;
  private readonly interceptors;
  private readonly requestCount$;
  constructor(params: Params);
  intercept(interceptor: HttpInterceptor): () => void;
  removeAllInterceptors(): void;
  getRequestCount$(): import('rxjs').Observable<number>;
  readonly delete: HttpHandler;
  readonly get: HttpHandler;
  readonly head: HttpHandler;
  readonly options: HttpHandler;
  readonly patch: HttpHandler;
  readonly post: HttpHandler;
  readonly put: HttpHandler;
  fetch: HttpHandler;
  private createRequest;
  private fetchResponse;
  private shorthand;
}
export {};
