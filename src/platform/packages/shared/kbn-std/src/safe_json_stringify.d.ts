/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Safely stringifies a value to JSON. Handles circular references by omitting
 * them from the output (treating them as `undefined`).
 *
 * If an unexpected error occurs during stringification, `handleError` will be
 * called if provided, otherwise `undefined` is returned.
 *
 * @param value         The value to stringify.
 * @param handleError   Optional callback that is called when an error occurs during
 *                      stringifying.
 * @returns             The JSON string representation of the value, or `undefined`
 *                      if an error occurs.
 */
export declare function safeJsonStringify(
  value: unknown,
  handleError?: (error: Error) => string | undefined
): string | undefined;
