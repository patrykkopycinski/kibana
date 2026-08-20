/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ProcRunner } from '@kbn/dev-proc-runner';
import type { KibanaTestServerLaunchConfig } from './kibana_test_server_launch_config';
export interface RunKibanaServerOptions {
  procs: ProcRunner;
  config: KibanaTestServerLaunchConfig;
  installDir?: string;
  extraKbnOpts?: string[];
  logsDir?: string;
  onEarlyExit?: (msg: string) => void;
  inspect?: boolean;
  remote?: boolean;
  /**
   * Prefix for UI process `path.data` temp dir (`${prefix}-ui-<uuid>`). FTR default: `ftr`. Scout uses `scout`.
   */
  uiEphemeralDirPrefix?: string;
  /**
   * Prefix for task-runner `path.data` temp dir (`${prefix}-task-runner-<uuid>`). Default: `ftr`.
   */
  taskRunnerEphemeralDirPrefix?: string;
}
export declare function runKibanaServer(options: RunKibanaServerOptions): Promise<void>;
