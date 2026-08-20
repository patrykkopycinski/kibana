/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/logging';
import type { ApplicationUsageMetric } from './metrics';
import type { Storage } from './storage';
import type { Report } from './report';
export interface ReporterConfig {
  http: ReportHTTP;
  logger: Logger;
  storage?: Storage;
  checkInterval?: number;
  storageKey?: string;
}
export type ReportHTTP = (report: Report) => Promise<void>;
export declare class Reporter {
  checkInterval: number;
  private interval?;
  private http;
  private logger;
  private reportManager;
  private storageManager;
  private retryCount;
  private readonly maxRetries;
  constructor(config: ReporterConfig);
  private saveToReport;
  private flushReport;
  start: () => void;
  reportUiCounter: (
    appName: string,
    type: string,
    eventNames: string | string[],
    count?: number
  ) => void;
  reportUserAgent: (appName: string) => void;
  reportApplicationUsage(appUsageReport: ApplicationUsageMetric): void;
  sendReports: () => Promise<void>;
}
