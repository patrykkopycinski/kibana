/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TestCase } from '@playwright/test/reporter';
import type { ScoutTestChannel } from '@kbn/scout-info';
export declare const getGitSHA1ForPath: (p: string) => Promise<string>;
export interface ScoutConfigManifest {
  path: string;
  exists: boolean;
  sha1: string;
  testChannels: ScoutTestChannel[];
  tests: {
    id: string;
    title: string;
    expectedStatus: string;
    tags: string[];
    location: TestCase['location'];
  }[];
}
export declare const testConfigManifests: {
  findPaths(): string[];
};
