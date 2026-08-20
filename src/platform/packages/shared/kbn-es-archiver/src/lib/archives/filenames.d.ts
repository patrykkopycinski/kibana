/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare function isGzip(path: string): boolean;
/**
 *  Check if a path is for a, potentially gzipped, mapping file
 *  @param  {String} path
 *  @return {Boolean}
 */
export declare function isMappingFile(path: string): boolean;
/**
 *  Sorts the filenames found in an archive so that
 *  "mappings" files come first, which is the order they
 *  need to be imported so that data files will have their
 *  indexes before the docs are indexed.
 *
 *  @param {Array<String>} filenames
 *  @return {Array<String>}
 */
export declare function prioritizeMappings(filenames: string[]): string[];
