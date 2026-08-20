/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOptions } from './type';
import { Type } from './type';
export type NumberOptions = TypeOptions<number> & {
  min?: number;
  max?: number;
  /**
   * When set to true, will accept unsafe numbers (integers > 2^53).
   * Otherwise, unsafe numbers will fail validation.
   * Default: `false`
   */
  unsafe?: boolean;
};
export declare class NumberType extends Type<number> {
  constructor(options?: NumberOptions);
  protected handleError(type: string, { limit, value }: Record<string, any>): string | undefined;
}
