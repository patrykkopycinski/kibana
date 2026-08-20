/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LogRecord, Layout } from '@kbn/logging';
import type { Conversion } from './conversions';
export interface PatternLayoutOptions {
  pattern?: string;
  highlight?: boolean;
  conversions?: Conversion[];
}
/**
 * Layout that formats `LogRecord` using the `pattern` string with optional
 * color highlighting (eg. to make log messages easier to read in the terminal).
 * @internal
 */
export declare class PatternLayout implements Layout {
  private readonly pattern;
  private readonly highlight;
  private readonly conversions;
  constructor({ pattern, highlight, conversions }?: PatternLayoutOptions);
  /**
   * Formats `LogRecord` into a string based on the specified `pattern` and `highlighting` options.
   * @param record Instance of `LogRecord` to format into string.
   */
  format(record: LogRecord): string;
}
