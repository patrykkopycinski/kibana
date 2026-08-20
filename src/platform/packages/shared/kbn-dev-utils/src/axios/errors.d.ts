/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AxiosError, AxiosResponse } from 'axios';
export interface AxiosRequestError extends AxiosError {
  response: undefined;
}
export interface AxiosResponseError<T> extends AxiosError {
  response: AxiosResponse<T>;
}
export declare const isAxiosRequestError: (error: any) => error is AxiosRequestError;
export declare const isAxiosResponseError: <T = any>(error: any) => error is AxiosResponseError<T>;
