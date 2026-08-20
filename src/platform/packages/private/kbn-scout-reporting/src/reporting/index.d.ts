/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReporterDescription } from 'playwright/test';
import type { ScoutPlaywrightReporterOptions } from './playwright/scout_playwright_reporter';
export * from './report';
export * from './stats';
export declare const scoutPlaywrightReporter: (
  options?: ScoutPlaywrightReporterOptions
) => ReporterDescription;
export declare const scoutFailedTestsReporter: (
  options?: ScoutPlaywrightReporterOptions
) => ReporterDescription;
export declare const scoutFailureSummaryReporter: (
  options?: ScoutPlaywrightReporterOptions
) => ReporterDescription;
