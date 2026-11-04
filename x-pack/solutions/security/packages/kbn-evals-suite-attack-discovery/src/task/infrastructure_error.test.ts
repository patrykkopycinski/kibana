/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import { esConnectivityErrors, responseError } from './es_error_fixtures';
import { getHttpStatus, isInfrastructureInferenceError } from './infrastructure_error';

describe('Elasticsearch client error shapes', () => {
  it.each(Object.entries(esConnectivityErrors))(
    'treats a %s (meta.statusCode 0, no code or cause) as infrastructure',
    (_name, create) => {
      expect(isInfrastructureInferenceError(create())).toBe(true);
    }
  );

  it('does not read statusCode 0 as an HTTP status', () => {
    expect(getHttpStatus(esConnectivityErrors.NoLivingConnectionsError())).toBeUndefined();
  });

  it('finds a connectivity error in the cause chain', () => {
    const wrapped = new Error('search failed', { cause: esConnectivityErrors.ConnectionError() });
    expect(isInfrastructureInferenceError(wrapped)).toBe(true);
  });

  it.each([408, 429, 502, 503, 504])('treats a ResponseError %i as infrastructure', (status) => {
    expect(isInfrastructureInferenceError(responseError(status))).toBe(true);
  });

  it.each([400, 418, 500])('treats a ResponseError %i as a model outcome', (status) => {
    expect(isInfrastructureInferenceError(responseError(status))).toBe(false);
  });

  it('treats other Elasticsearch client errors as a model outcome', () => {
    expect(isInfrastructureInferenceError(new errors.ConfigurationError('bad config'))).toBe(false);
  });
});
