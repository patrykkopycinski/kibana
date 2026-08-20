/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface TestFilesValidationResult {
  testFiles: string[];
  configPath: string;
}
/**
 * Validates and processes test files or directories, deriving the appropriate config path
 * @param testFilesList Comma-separated string of test file/directory paths
 * @returns Validation result with processed test files and derived config path
 */
export declare function validateAndProcessTestFiles(
  testFilesList: string
): TestFilesValidationResult;
