/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaExecutionContext } from '@kbn/core-execution-context-common';
export declare const BAGGAGE_MAX_PER_NAME_VALUE_PAIRS = 4096;
/**
 * @public
 */
export interface IExecutionContextContainer {
  toHeader: () => Record<string, string>;
  toJSON: () => Readonly<KibanaExecutionContext>;
}
export declare class ExecutionContextContainer implements IExecutionContextContainer {
  #private;
  constructor(context: Readonly<KibanaExecutionContext>);
  private toString;
  toHeader(): {
    'x-kbn-context': string;
  };
  toJSON(): Readonly<KibanaExecutionContext>;
}
