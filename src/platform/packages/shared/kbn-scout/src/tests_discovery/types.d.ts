/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutTargetArch, ScoutTargetDomain, ScoutTestChannel } from '@kbn/scout-info';
export type TargetType = 'all' | 'local' | 'local-stateful-only' | 'mki' | 'ech';
export declare const TARGET_TYPES: TargetType[];
export interface ModuleDiscoveryInfo {
  name: string;
  group: string;
  type: 'plugin' | 'package';
  /**
   * Set when --code-changes is provided: true if this module's @kbn/ ID is in
   * the affected set (or if it owns an affected config in the tests-only fast
   * path). Used to drive the "affected " prefix on Buildkite step labels.
   */
  isAffected?: boolean;
  configs: {
    path: string;
    hasTests: boolean;
    tags: string[];
    serverRunFlags: string[];
    usesParallelWorkers: boolean;
    testChannels?: ScoutTestChannel[];
  }[];
}
export interface FlattenedConfigGroup {
  testTarget: {
    arch: ScoutTargetArch;
    domain: ScoutTargetDomain;
  };
  group: string;
  scoutCommand: string;
  configs: string[];
}
