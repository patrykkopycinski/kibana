/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RunFn, RunOptions } from './types';
import type { FlagOptions, FlagsOf } from '../flags/types';
export declare function run<T, TFlagOptions extends FlagOptions = FlagOptions>(
  fn: RunFn<T, FlagsOf<TFlagOptions>>,
  options?: RunOptions<TFlagOptions>
): Promise<T | undefined>;
