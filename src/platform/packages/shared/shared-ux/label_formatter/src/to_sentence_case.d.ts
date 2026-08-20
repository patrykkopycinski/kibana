/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Converts a string to sentence case.
 * For glossary terms, applies the exact formatting from the glossary.
 * For non-glossary terms, capitalizes only the first letter.
 *
 * @param label - The label string to format
 * @returns formatted label string
 * @example
 * toSentenceCase('machine learning') // 'Machine Learning' - Glossary term
 * toSentenceCase('settings') // 'Settings' - First letter capitalized
 */
export declare function toSentenceCase(label: string): string;
