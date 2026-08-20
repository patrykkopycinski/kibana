/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Transform } from 'stream';
export declare function formatBytes(bytes: number): string;
export interface DownloadProgress {
  /** Passthrough stream to place in the download pipeline; counts bytes seen. */
  meter: Transform;
  /** Stop and clear the progress bar. Always safe to call. */
  stop: () => void;
}
/**
 * Creates a passthrough Transform that tracks bytes received and drives a
 * `cli-progress` bar showing downloaded/total bytes, percentage and speed.
 *
 * In non-TTY environments (agents, CI, redirected output) it emits periodic
 * plain-text log lines via `logInfo` instead of an in-place bar so logs stay
 * readable. When `contentLength` is unknown only bytes-received and speed are
 * shown so the display is never falsely at 100%.
 */
export declare const createDownloadProgressBar: (
  contentLength: number | undefined,
  logInfo?: (msg: string) => void
) => DownloadProgress;
