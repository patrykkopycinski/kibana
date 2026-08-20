/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare function shouldPreferCachedSnapshot(useCached?: boolean): boolean;
export declare function getSnapshotPlatformArch(): {
  platform: string;
  arch: string;
  ext: string;
};
export declare function getSnapshotCacheFilename(version: string): string;
export declare function findLocalCachedSnapshot(
  basePath: string,
  version: string
): string | undefined;
