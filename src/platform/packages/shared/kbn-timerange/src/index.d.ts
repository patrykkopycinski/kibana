/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Represents a time range with from and to ISO string dates
 */
export interface TimeRange {
  from: string;
  to: string;
  mode?: 'absolute' | 'relative';
}
export declare function getDateRange({ from, to }: { from: string; to: string }): {
  startDate: number;
  endDate: number;
};
export declare function getDateISORange({ from, to }: { from: string; to: string }): {
  startDate: string;
  endDate: string;
};
export declare function getTimeDifferenceInSeconds(
  input:
    | {
        startDate: number;
        endDate: number;
      }
    | TimeRange
): number;
export declare function getOffsetFromNowInSeconds(epochDate: number): number;
