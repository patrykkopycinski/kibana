/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type fs from 'node:fs';
/** CODEOWNERS file path **/
export declare const CODE_OWNERS_FILE: string;
/**
 * Throw an error if the given path does not exist
 *
 * @param targetPath Path to check
 * @param description Path description used in the error message if an exception is thrown
 * @param cli Whether this function is called from a CLI context
 */
export declare function throwIfPathIsMissing(
  targetPath: fs.PathLike,
  description?: string,
  cli?: boolean
): void;
/**
 * Throw an error if the given path does not reside in this repo
 *
 * @param targetPath Path to check
 * @param cli Whether this function is called from a CLI context
 */
export declare function throwIfPathNotInRepo(targetPath: fs.PathLike, cli?: boolean): void;
