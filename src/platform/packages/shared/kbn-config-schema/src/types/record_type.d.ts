/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SchemaTypeError } from '../errors';
import type { TypeOptions, ExtendsDeepOptions, UnknownOptions } from './type';
import { Type } from './type';
export type RecordOfOptions<K extends string, V> = TypeOptions<Record<K, V>> & UnknownOptions;
export declare class RecordOfType<K extends string, V> extends Type<Record<K, V>> {
  private readonly keyType;
  private readonly valueType;
  private readonly options;
  constructor(keyType: Type<K>, valueType: Type<V>, options?: RecordOfOptions<K, V>);
  extendsDeep(options: ExtendsDeepOptions): RecordOfType<K, V>;
  protected handleError(
    type: string,
    { entryKey, reason, value }: Record<string, any>,
    path: string[]
  ): string | SchemaTypeError | undefined;
}
