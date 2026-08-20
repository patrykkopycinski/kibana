/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Command } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export interface EventUploadOptions {
  esURL: string;
  esAPIKey: string;
  verifyTLSCerts: boolean;
  log: ToolingLog;
}
export declare const uploadAllEventsFromPath: (
  eventLogPath: string,
  options: EventUploadOptions
) => Promise<void>;
export declare const nonThrowingUploadAllEventsFromPath: (
  eventLogPath: string,
  options: EventUploadOptions
) => Promise<void>;
export declare const uploadEvents: Command<void>;
