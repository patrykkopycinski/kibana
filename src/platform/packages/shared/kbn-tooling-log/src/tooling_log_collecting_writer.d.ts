/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolingLogTextWriter } from './tooling_log_text_writer';
import type { LogLevel } from './log_levels';
import type { Message } from './message';
export declare class ToolingLogCollectingWriter extends ToolingLogTextWriter {
  messages: string[];
  constructor(level?: LogLevel);
  /**
   * Called by ToolingLog, extends messages with the source and context if message include it.
   */
  write(msg: Message): boolean;
}
