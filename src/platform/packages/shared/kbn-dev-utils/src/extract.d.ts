/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

interface Options {
  /**
   * Path to the archive to extract, .tar, .tar.gz, and .zip archives are supported
   */
  archivePath: string;
  /**
   * Directory where the contents of the archive will be written. Existing files in that
   * directory will be overwritten. If the directory doesn't exist it will be created.
   */
  targetDir: string;
  /**
   * Number of path segments to strip form paths in the archive, like --strip-components from tar
   */
  stripComponents?: number;
  /**
   * Write modified timestamps to extracted files
   */
  setModifiedTimes?: Date;
}
/**
 * Extract tar and zip archives using a single function, supporting stripComponents
 * for both archive types, only tested with familiar archives we create so might not
 * support some weird exotic zip features we don't use in our own snapshot/build tooling
 */
export declare function extract({
  archivePath,
  targetDir,
  stripComponents,
  setModifiedTimes,
}: Options): Promise<void>;
export {};
