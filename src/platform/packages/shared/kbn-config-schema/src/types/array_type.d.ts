/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOptions, ExtendsDeepOptions, UnknownOptions } from './type';
import { Type } from './type';
export type ArrayOptions<T> = TypeOptions<T[]> &
  UnknownOptions & {
    minSize?: number;
    maxSize?: number;
  };
export declare class ArrayType<T> extends Type<T[]> {
  private readonly arrayType;
  private readonly arrayOptions;
  constructor(type: Type<T>, options?: ArrayOptions<T>);
  extendsDeep(options: ExtendsDeepOptions): ArrayType<T>;
  protected handleError(type: string, { limit, reason, value }: Record<string, any>): any;
}
