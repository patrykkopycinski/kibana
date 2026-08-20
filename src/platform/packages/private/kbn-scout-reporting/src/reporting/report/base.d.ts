/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Generic error raised by a Scout report
 */
export declare class ScoutReportError extends Error {}
export declare abstract class ScoutReport {
  log: ToolingLog;
  workDir: string;
  concluded: boolean;
  reportName: string;
  protected constructor(reportName: string, log?: ToolingLog);
  /**
   * Defensive utility function used to guard against modifying the report after it has concluded
   *
   * @param additionalInfo Description of the report action that was prevented
   * @protected
   */
  protected raiseIfConcluded(additionalInfo?: string): void;
  /**
   * Call this when you're done adding information to this report.
   *
   * ⚠️**This will delete all the contents of the report's working directory**
   */
  conclude(): void;
}
