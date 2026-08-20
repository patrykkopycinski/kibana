/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Lifecycle } from './lifecycle';
export interface SuiteInProgress {
  startTime?: Date;
  endTime?: Date;
  success?: boolean;
}
export interface SuiteWithMetadata {
  config: string;
  file: string;
  tag: string;
  title: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  success: boolean;
  hasTests: boolean;
}
export declare class SuiteTracker {
  finishedSuitesByConfig: Record<string, Record<string, SuiteWithMetadata>>;
  inProgressSuites: Map<object, SuiteInProgress>;
  static startTracking(lifecycle: Lifecycle, configPath: string): SuiteTracker;
  getTracked(suite: object): SuiteInProgress;
  constructor(lifecycle: Lifecycle, configPathAbsolute: string);
  getAllFinishedSuites(): SuiteWithMetadata[];
}
