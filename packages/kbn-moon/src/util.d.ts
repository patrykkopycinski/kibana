/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Package } from '@kbn/repo-packages';
export declare function readFile(filePath: string): string;
export declare function readJsonWithComments(filePath: string): any;
export declare function sortObjectByKeyPriority(obj: any, keyOrder?: string[]): void;
export declare function resolveFirstExisting(dir: string, files: string[]): string | undefined;
export declare function filterPackages(allPackages: Package[], filter: string[]): Package[];
export declare function renderYaml(obj: any, preamble?: string | null): string;
/** True when `filePath` already holds exactly the rendered YAML (no write needed). */
export declare function yamlMatchesFile(
  filePath: string,
  obj: any,
  preamble?: string | null
): boolean;
export declare function writeYaml(filePath: string, obj: any, preamble?: string | null): boolean;
export declare function compactFilePathsToGlobs(filePaths: string[]): string[];
