/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isResponseError } from '@kbn/es-errors';

/** The error type, not the status: other 404s (a missing resource, a proxy answering 404) are real failures. */
export const isIndexNotFound = (error: unknown): boolean =>
  isResponseError(error) && error.body?.error?.type === 'index_not_found_exception';
