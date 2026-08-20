/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Jest config discovery using git ls-files and simplified parsing.
 *
 * Uses a fast git ls-files + simplified parsing approach for most configs,
 * then falls back to Jest's SearchSource for configs that appear empty
 * to catch edge cases that the simplified parsing might miss.
 *
 * @param configPaths Optional array of specific config paths to process
 * @returns Promise resolving to object with configs that have tests, configs that don't, orphaned test files, and duplicates
 */
export declare function getJestConfigs(configPaths?: string[]): Promise<{
  configsWithTests: Array<{
    config: string;
    testFiles: string[];
  }>;
  emptyConfigs: string[];
  orphanedTestFiles: string[];
  duplicateTestFiles: Array<{
    testFile: string;
    configs: string[];
  }>;
}>;
