/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type * as Rx from 'rxjs';
import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Observe the logs for a container, reflecting the log lines
 * to the ToolingLog and the returned Observable
 */
export declare function observeContainerLogs(
  name: string,
  containerId: string,
  log: ToolingLog
): Rx.Observable<string>;
/**
 * Check if a log line from stderr is actually an error or just info/debug written to stderr
 */
export declare function isActualError(line: string): boolean;
