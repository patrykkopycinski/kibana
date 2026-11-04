/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';

type Diagnostic = ConstructorParameters<typeof errors.ResponseError>[0];

// Real `@elastic/transport` error instances, so tests see the shapes the ES client throws.
export const diagnostic = (statusCode: number, body?: unknown): Diagnostic => ({
  body,
  statusCode,
  headers: {},
  warnings: null,
  meta: {
    context: null,
    name: 'elasticsearch-js',
    request: { params: { method: 'POST', path: '/_search' }, options: {}, id: 1 },
    connection: null,
    attempts: 0,
    aborted: false,
  },
});

export const responseError = (statusCode: number) =>
  new errors.ResponseError(
    diagnostic(statusCode, {
      error: { type: 'search_phase_execution_exception' },
      status: statusCode,
    })
  );

// `Transport.js` (@elastic/transport 9.4.0) builds these from a result whose `statusCode` is 0 and
// whose `body` is undefined, because no HTTP response arrived.
const noResponse = () => diagnostic(0);

export const esConnectivityErrors = {
  ConnectionError: () =>
    new errors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', noResponse()),
  TimeoutError: () => new errors.TimeoutError('Request timed out', noResponse()),
  RequestAbortedError: () => new errors.RequestAbortedError('Request aborted', noResponse()),
  NoLivingConnectionsError: () =>
    new errors.NoLivingConnectionsError('no usable connection', noResponse()),
} as const;
