/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ByteSizeValue } from '../byte_size_value';
import type { SchemaTypeError } from '../errors';
import { Type } from './type';
export interface ByteSizeOptions {
  validate?: (value: ByteSizeValue) => string | void;
  defaultValue?: ByteSizeValue | string | number;
  min?: ByteSizeValue | string | number;
  max?: ByteSizeValue | string | number;
}
export declare class ByteSizeType extends Type<ByteSizeValue> {
  constructor(options?: ByteSizeOptions);
  protected handleError(
    type: string,
    { limit, message, value }: Record<string, any>,
    path: string[]
  ): string | SchemaTypeError | undefined;
}
