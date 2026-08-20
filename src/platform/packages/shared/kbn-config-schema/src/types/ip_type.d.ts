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
export type IpVersion = 'ipv4' | 'ipv6';
export type IpOptions = TypeOptions<string> & {
  /**
   * IP versions to accept, defaults to ['ipv4', 'ipv6'].
   */
  versions: IpVersion[];
};
export declare class IpType extends Type<string> {
  constructor(options?: IpOptions);
  protected handleError(type: string, { value, version }: Record<string, any>): string | undefined;
}
