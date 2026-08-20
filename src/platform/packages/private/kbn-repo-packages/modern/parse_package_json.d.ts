/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

declare const _exports: {
  readPackageJson: typeof readPackageJson;
  validateParsedPackageJson: typeof validateParsedPackageJson;
};
export = _exports;
/**
 * Asserts that given value looks like a parsed package.json file
 * @param {unknown} v
 * @returns {asserts v is import('./types').ParsedPackageJson}
 */
declare function validateParsedPackageJson(
  v: unknown
): asserts v is import('./types').ParsedPackageJson;
/**
 * Reads a given package.json file from disk and parses it
 * @param {string} path
 * @returns {import('./types').ParsedPackageJson | undefined}
 */
declare function readPackageJson(path: string): import('./types').ParsedPackageJson | undefined;
