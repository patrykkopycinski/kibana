/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SchemaTypesError } from '../errors';
import type { ExtendsDeepOptions } from './type';
import { Type, type TypeOptions } from './type';
export type UnionTypeOptions<T> = TypeOptions<T>;
export declare class UnionType<RTS extends Array<Type<any>>, T> extends Type<T> {
  private readonly unionTypes;
  private readonly typeOptions?;
  constructor(types: RTS, options?: UnionTypeOptions<T>);
  extendsDeep(options: ExtendsDeepOptions): UnionType<Type<any>[], T>;
  protected handleError(
    type: string,
    { value, details }: Record<string, any>,
    path: string[]
  ): string | SchemaTypesError | undefined;
}
