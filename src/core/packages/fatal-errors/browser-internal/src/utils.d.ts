/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Produce a string version of an error,
 */
export declare function formatError(error: string | Error, source?: string): string;
/**
 * Format the stack trace from a message so that it setups with the message, which
 * some browsers do automatically and some don't
 */
export declare function formatStack(error: string | Error): string;
