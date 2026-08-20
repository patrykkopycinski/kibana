/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConfigModule } from './config_loading';
declare const $values: unique symbol;
interface Options {
  settings?: Record<string, any>;
  primary?: boolean;
  path: string;
  module: ConfigModule;
}
export declare class Config {
  readonly path: string;
  readonly module: ConfigModule;
  private [$values];
  constructor(options: Options);
  has(key: string | string[]): boolean;
  get(key: string | string[], defaultValue?: any): any;
  getAll(): any;
}
export {};
