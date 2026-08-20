/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
/**
 * A function which will be called when the CLI is torn-down which should
 * quickly cleanup whatever it needs.
 */
export type CleanupTask = () => void;
export declare class Cleanup {
  private readonly log;
  helpText: string;
  private readonly tasks;
  static setup(log: ToolingLog, helpText: string): Cleanup;
  constructor(log: ToolingLog, helpText: string, tasks: CleanupTask[]);
  add(task: CleanupTask): void;
  execute(topLevelError?: any): void;
  private onError;
}
