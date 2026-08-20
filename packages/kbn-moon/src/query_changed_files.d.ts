/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

type ChangedFilesScope = 'local' | 'staged' | 'branch';
export interface GetMoonChangedFilesOptions {
  scope: ChangedFilesScope;
  base?: string;
  head?: string;
}
/** Builds CLI args for `moon query changed-files` based on scope. */
export declare const buildChangedFilesArgs: ({
  scope,
  base,
  head,
}: GetMoonChangedFilesOptions) => string[];
/**
 * Queries Moon for changed files in the given scope.
 *
 * Returns repo-relative paths of files that exist on disk (deleted files are excluded).
 */
export declare const getMoonChangedFiles: ({
  scope,
  base,
  head,
}: GetMoonChangedFilesOptions) => Promise<string[]>;
export {};
