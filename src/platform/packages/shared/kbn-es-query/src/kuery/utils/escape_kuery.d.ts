/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Escapes backslashes and double-quotes. (Useful when putting a string in quotes to use as a value
 * in a KQL expression. See the QuotedCharacter rule in kuery.peg.)
 */
export declare function escapeQuotes(str: string): string;
/**
 * Escapes a Kuery node value to ensure that special characters, operators, and whitespace do not result in a parsing error or unintended
 * behavior when using the value as an argument for the `buildNode` function.
 */
export declare const escapeKuery: (str: string) => string;
