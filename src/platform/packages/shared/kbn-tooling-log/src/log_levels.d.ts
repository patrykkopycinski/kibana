/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

declare const LEVELS: readonly [
  'silent',
  'error',
  'warning',
  'success',
  'info',
  'debug',
  'verbose'
];
export declare const DEFAULT_LOG_LEVEL: 'info';
export type LogLevel = (typeof LEVELS)[number];
export declare function pickLevelFromFlags(
  flags: Record<string, string | boolean | string[] | undefined>,
  options?: {
    default?: LogLevel;
  }
): 'debug' | 'error' | 'info' | 'silent' | 'success' | 'verbose' | 'warning';
export declare const LOG_LEVEL_FLAGS: Array<{
  name: 'verbose' | 'info' | 'debug' | 'quiet' | 'silent';
  flag: string;
  description: string;
}>;
export declare function getLogLevelFlagHelpItems(defaultLogLevel?: string): Array<{
  flag: string;
  description: string;
}>;
export declare function getLogLevelFlagsHelp(defaultLogLevel?: string): string;
export type ParsedLogLevel = ReturnType<typeof parseLogLevel>;
export declare function parseLogLevel(name: LogLevel): {
  name: 'debug' | 'error' | 'info' | 'silent' | 'success' | 'verbose' | 'warning';
  flags: { [key in LogLevel]: boolean };
};
export {};
