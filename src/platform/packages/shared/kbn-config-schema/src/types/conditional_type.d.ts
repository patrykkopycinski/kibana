/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reference } from '../references';
import type { ExtendsDeepOptions, TypeOptions } from './type';
import { Type } from './type';
export type ConditionalTypeValue = string | number | boolean | object | null;
export declare class ConditionalType<A extends ConditionalTypeValue, B, C> extends Type<B | C> {
  private readonly leftOperand;
  private readonly rightOperand;
  private readonly equalType;
  private readonly notEqualType;
  private readonly options?;
  constructor(
    leftOperand: Reference<A>,
    rightOperand: Reference<A> | A | Type<unknown>,
    equalType: Type<B>,
    notEqualType: Type<C>,
    options?: TypeOptions<B | C>
  );
  extendsDeep(options: ExtendsDeepOptions): ConditionalType<A, B, C>;
  protected handleError(type: string, { value }: Record<string, any>): string | undefined;
}
