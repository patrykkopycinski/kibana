/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LogLevel, ParsedLogLevel } from './log_levels';
import type { Writer } from './writer';
import type { Message } from './message';
export interface ToolingLogTextWriterConfig {
  /**
   * Log level, messages below this level will be ignored
   */
  level: LogLevel;
  /**
   * List of message sources/ToolingLog types which will be ignored. Create
   * a logger with `ToolingLog#withType()` to create messages with a specific
   * source. Ignored messages will be dropped without writing.
   */
  ignoreSources?: string[];
  /**
   * Target which will receive formatted message lines, a common value for `writeTo`
   * is process.stdout
   */
  writeTo: {
    write(s: string): void;
  };
}
export declare class ToolingLogTextWriter implements Writer {
  readonly level: ParsedLogLevel;
  readonly writeTo: {
    write(msg: string): void;
  };
  private readonly ignoreSources?;
  constructor(config: ToolingLogTextWriterConfig);
  write(msg: Message): boolean;
  static write(writeTo: ToolingLogTextWriter['writeTo'], prefix: string, msg: Message): void;
}
