/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type ChildProcess from 'child_process';
import { type ForkOptions } from 'child_process';
import type * as Rx from 'rxjs';
import type { SomeDevLog } from '@kbn/some-dev-log';
interface StartTSWorkerArgs extends ForkOptions {
  log: SomeDevLog;
  /** Path to worker source. Best practice to `require.resolve('../relative/paths')` */
  src: string;
}
/**
 * Provide a TS file as the src of a NodeJS Worker with some built-in handling
 * of std streams and debugging.
 */
export declare function startTSWorker<Message>({
  log,
  src,
  cwd,
  execArgv,
  stdio,
  ...forkOptions
}: StartTSWorkerArgs): {
  msg$: Rx.Observable<Message>;
  proc: ChildProcess.ChildProcess;
};
export {};
