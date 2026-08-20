/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type * as Rx from 'rxjs';
export type GetArgsType<T extends LifecyclePhase<any>> = T extends LifecyclePhase<infer X>
  ? X
  : never;
export declare class LifecyclePhase<Args extends readonly any[]> {
  private readonly options;
  private readonly handlers;
  triggered: boolean;
  private readonly beforeSubj;
  readonly before$: Rx.Observable<void>;
  private readonly afterSubj;
  readonly after$: Rx.Observable<void>;
  constructor(
    sub: Rx.Subscription,
    options?: {
      singular?: boolean;
    }
  );
  add(fn: (...args: Args) => Promise<void> | void): void;
  addSub(sub: Rx.Subscription): void;
  trigger(...args: Args): Promise<void>;
}
