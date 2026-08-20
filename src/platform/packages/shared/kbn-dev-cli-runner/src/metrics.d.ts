/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
export type MetricsMeta = Map<string, string | boolean | number>;
export declare class Metrics {
  private reporter;
  meta: MetricsMeta;
  startTime: number;
  filePath: string;
  constructor(log: ToolingLog);
  createTiming(
    meta: object,
    command?: string
  ): {
    group: string;
    id: string;
    ms: number;
    meta: {
      nestedTiming: string | undefined;
    };
  };
  reportCancelled(command?: string): Promise<boolean | undefined>;
  reportSuccess(command?: string): Promise<boolean | undefined>;
  reportError(errorMessage?: string, command?: string): Promise<boolean | undefined>;
}
