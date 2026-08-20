/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IHttpFetchError } from '@kbn/core-http-browser';
/** @internal */
export declare class HttpFetchError extends Error implements IHttpFetchError {
  readonly request: Request;
  readonly response?: Response | undefined;
  readonly body?: any;
  readonly name: string;
  constructor(
    message: string,
    name: string,
    request: Request,
    response?: Response | undefined,
    body?: any
  );
}
