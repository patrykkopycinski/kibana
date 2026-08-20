/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IHttpFetchError } from './types';
/** @public */
export declare function isHttpFetchError<T>(error: T | IHttpFetchError): error is IHttpFetchError;
type HttpPathParamPrimitive = string | number | boolean;
type HttpPathParamValue = HttpPathParamPrimitive | readonly HttpPathParamPrimitive[];
type HttpPathParams = Record<string, HttpPathParamValue | undefined>;
/**
 * Builds a URL path from a route template by URI-encoding path params.
 *
 * @example
 * buildPath('/api/dashboards/{id}', { id: '../../../internal/security/users/foo' });
 * // '/api/dashboards/..%2F..%2F..%2Finternal%2Fsecurity%2Fusers%2Ffoo'
 *
 * @example
 * buildPath('/api/files/{filePath*}', { filePath: 'nested/folder/my file.txt' });
 * // '/api/files/nested/folder/my%20file.txt'
 *
 * @public
 */
export declare function buildPath(path: string, params?: HttpPathParams): string;
export {};
