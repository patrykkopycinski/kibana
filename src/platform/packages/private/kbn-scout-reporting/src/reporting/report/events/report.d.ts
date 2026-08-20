/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { ScoutReportEvent } from './event';
import { ScoutReport } from '../base';
/**
 *
 */
export declare class ScoutEventsReport extends ScoutReport {
  private readonly eventLogFileDescriptor;
  constructor(log?: ToolingLog);
  get eventLogPath(): string;
  /**
   * Logs an event to be processed by this reporter
   *
   * @param event {ScoutReportEvent} - Event to record
   */
  logEvent(event: ScoutReportEvent): void;
  /**
   * Save the report to a non-ephemeral location
   *
   * @param destination - Full path to the save location. Must not exist.
   */
  save(destination: string): void;
}
