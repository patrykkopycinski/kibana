/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Duration } from '../duration';
import type { SchemaTypeError } from '../errors';
import type { Reference } from '../references';
import { Type } from './type';
export type DurationValueType = Duration | string | number;
export interface DurationOptions {
  defaultValue?: DurationValueType | Reference<DurationValueType> | (() => DurationValueType);
  validate?: (value: Duration) => string | void;
  min?: DurationValueType;
  max?: DurationValueType;
}
export declare class DurationType extends Type<Duration> {
  constructor(options?: DurationOptions);
  protected handleError(
    type: string,
    { message, value, limit }: Record<string, any>,
    path: string[]
  ): string | SchemaTypeError | undefined;
}
