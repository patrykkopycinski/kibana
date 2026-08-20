/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RunContext, RunOptions } from './types';
import type { FlagOptions } from '../flags/types';
export type CommandRunFn<T> = (context: RunContext & T) => Promise<void> | void;
export interface Command<T> {
  name: string;
  run: CommandRunFn<T>;
  description: RunOptions['description'];
  usage?: RunOptions['usage'];
  flags?: FlagOptions;
}
export interface RunWithCommandsOptions<T> {
  log?: RunOptions['log'];
  description?: RunOptions['description'];
  usage?: RunOptions['usage'];
  globalFlags?: FlagOptions;
  extendContext?(context: RunContext): Promise<T> | T;
}
export declare class RunWithCommands<T> {
  private readonly options;
  private readonly commands;
  constructor(options: RunWithCommandsOptions<T>, commands?: Array<Command<T>>);
  command(options: Command<T>): RunWithCommands<T>;
  execute(): Promise<void>;
}
