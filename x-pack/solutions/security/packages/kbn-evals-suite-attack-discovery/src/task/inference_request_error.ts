/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The inference request failed before any model response reached the suite (transport failure
 * or an HTTP/connector error). Thrown instead of a plain `Error` so the task can classify the
 * failure as infrastructure by type rather than by message text.
 */
export class InferenceRequestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InferenceRequestError';
  }
}
