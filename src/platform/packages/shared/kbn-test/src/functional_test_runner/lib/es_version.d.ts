/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type semver from 'semver';
export declare class EsVersion {
  static getDefault(): EsVersion;
  readonly parsed: semver.SemVer;
  constructor(version: string);
  toJSON(): string;
  toString(): string;
  /**
   * Determine if the ES version matches a semver range, like >=7 or ^8.1.0
   */
  matchRange(range: string): boolean;
  /**
   * Determine if the ES version matches a specific version, ignores things like -SNAPSHOT
   */
  eql(version: string): boolean | null;
}
