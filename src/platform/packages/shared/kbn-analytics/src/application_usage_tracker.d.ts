/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reporter } from './reporter';
interface ApplicationKey {
  appId: string;
  viewId: string;
}
export declare class ApplicationUsageTracker {
  private trackedApplicationViews;
  private reporter;
  private currentAppId?;
  private currentApplicationKeys;
  private beforeUnloadListener?;
  private onVisiblityChangeListener?;
  constructor(reporter: Reporter);
  private createKey;
  static serializeKey({ appId, viewId }: ApplicationKey): string;
  private trackApplications;
  private attachListeners;
  private detachListeners;
  private sendMetricsToReporter;
  updateViewClickCounter(viewId: string): void;
  private flushTrackedViews;
  start(): void;
  stop(): void;
  setCurrentAppId(appId: string): void;
  trackApplicationViewUsage(viewId: string): void;
  pauseTrackingAll(): void;
  resumeTrackingAll(): void;
  flushTrackedView(viewId: string): void;
}
export {};
