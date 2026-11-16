/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The Kibana http client carries the status on `response`; a plain thrown Error has none. Its own
 * module so the page can ask the same question as the retry policy while the hooks are mocked.
 */
export const isClientError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  return status !== undefined && status >= 400 && status < 500;
};
