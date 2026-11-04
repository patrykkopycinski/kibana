/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';

type Diagnostic = ConstructorParameters<typeof errors.ResponseError>[0];

// Real `@elastic/transport` error instances, so tests see the shapes the ES client throws.
export const diagnostic = (statusCode: number): Diagnostic => ({
  body: { error: { type: 'search_phase_execution_exception' }, status: statusCode },
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
  new errors.ResponseError(diagnostic(statusCode));

export const esConnectivityErrors = {
  ConnectionError: () => new errors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200'),
  TimeoutError: () => new errors.TimeoutError('Request timed out'),
  RequestAbortedError: () => new errors.RequestAbortedError('Request aborted'),
  NoLivingConnectionsError: () =>
    new errors.NoLivingConnectionsError('no usable connection', diagnostic(0)),
} as const;
