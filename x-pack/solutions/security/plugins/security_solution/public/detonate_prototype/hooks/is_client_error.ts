/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | undefined)?.response?.status;

/**
 * The Kibana http client carries the status on `response`; a plain thrown Error has none. This
 * module is separate from the hooks so the page can use `isRejectedFilter` while the hooks are
 * mocked in its tests.
 */
const isClientError = (error: unknown): boolean => {
  const status = statusOf(error);
  return status !== undefined && status >= 400 && status < 500;
};

/**
 * Only a 400 means the server rejected the filter (a KQL it cannot parse). Any other 4xx (401,
 * 403, 404...) is an ordinary failure and renders as one.
 */
export const isRejectedFilter = (error: unknown): boolean => statusOf(error) === 400;

/**
 * Retry policy for the runs and stats queries: a 4xx answers the same on every retry, except 429,
 * which is the server asking the client to try again; anything else gets up to three tries.
 */
export const shouldRetry = (failureCount: number, error: unknown): boolean =>
  failureCount < 3 && (!isClientError(error) || statusOf(error) === 429);
