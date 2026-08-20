/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Produces a diff string which is nicely formatted to show the differences between two strings. This will
 * be a multi-line string so it's generally a good idea to include a `\n` before this first line of the diff
 * if you are concatenating it with another message.
 */
export declare function diffStrings(expected: string, received: string): string | undefined;
