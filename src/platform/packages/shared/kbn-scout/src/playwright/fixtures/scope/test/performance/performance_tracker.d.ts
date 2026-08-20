/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CDPSession, TestInfo } from '@playwright/test';
import type { BundleInfo, PageInfo, PerformanceMetrics } from './types';
export declare class PerformanceTracker {
  private testInfo;
  private bundleResponses;
  constructor(testInfo: TestInfo);
  private getRequestData;
  captureBundleResponses(cdp: CDPSession): void;
  waitForJsLoad(cdp: CDPSession, timeout?: number): Promise<void>;
  computeBundleStats(bundleResponses: Map<string, BundleInfo>): PageInfo;
  collectJsBundleStats(url: string): PageInfo;
  capturePagePerformanceMetrics(cdp: CDPSession): Promise<{
    jsHeapUsedSize: number | undefined;
    jsHeapTotalSize: number | undefined;
    cpuTime: number | undefined;
    scriptTime: number | undefined;
    layoutTime: number | undefined;
    fps: number | undefined;
    nodesCount: number | undefined;
    documentsCount: number | undefined;
    layoutCount: number | undefined;
    styleRecalcCount: number | undefined;
  }>;
  private comparePerformanceMetrics;
  collectPagePerformanceStats: (
    url: string,
    before: PerformanceMetrics,
    after: PerformanceMetrics
  ) => Record<
    string,
    {
      before: number;
      after: number;
      diff: number;
      percentage: string;
    }
  >;
}
