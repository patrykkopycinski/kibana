/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare function toSlugIdentifier(value?: string): string;
/**
 * Validates whether a string is already a valid slug identifier.
 *
 * @param value - The string to validate
 * @returns True if the value is a valid slug identifier
 */
export declare function isValidSlugIdentifier(value?: string): boolean;
