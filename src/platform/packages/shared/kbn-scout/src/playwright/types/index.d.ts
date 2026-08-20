/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PlaywrightTestConfig, PlaywrightTestOptions } from 'playwright/test';
import type { ScoutTestChannel } from '@kbn/scout-info';
export type Protocol = 'http' | 'https';
export declare const VALID_CONFIG_MARKER: unique symbol;
export type ScoutPlaywrightProjects = 'local' | 'ech' | 'mki';
export type ScoutConfigName = 'local' | 'cloud_ech' | 'cloud_mki';
export interface ScoutTestOptions extends PlaywrightTestOptions {
  serversConfigDir: string;
  configName: ScoutConfigName;
  [VALID_CONFIG_MARKER]: boolean;
  runGlobalSetup?: boolean;
}
export interface ScoutPlaywrightOptions extends Pick<PlaywrightTestConfig, 'testDir' | 'workers'> {
  testDir: string;
  workers?: 1 | 2 | 3;
  /**
   * When true, runs global.setup.ts as a pre-step before running tests.
   * Defaults to false.
   */
  runGlobalSetup?: boolean;
  metadata?: {
    scout?: {
      testChannels?: ScoutTestChannel[];
    };
    [key: string]: unknown;
  };
}
export type { ScoutTestChannel, ScoutTestChannelsDefinition } from '@kbn/scout-info';
