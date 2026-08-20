/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { CoreService } from '@kbn/core-base-browser-internal';
import type { FatalErrorsSetup } from '@kbn/core-fatal-errors-browser';
/** @public */
export interface LoadingCountSetup {
  addLoadingCountSource(countSource$: Observable<number>): void;
  getLoadingCount$(): Observable<number>;
}
/**
 * See {@link LoadingCountSetup}.
 * @public
 */
export type LoadingCountStart = LoadingCountSetup;
/** @internal */
export declare class LoadingCountService
  implements CoreService<LoadingCountSetup, LoadingCountStart>
{
  private readonly stop$;
  private readonly loadingCount$;
  setup({ fatalErrors }: { fatalErrors: FatalErrorsSetup }): {
    getLoadingCount$: () => Observable<number>;
    addLoadingCountSource: (count$: Observable<number>) => void;
  };
  start({ fatalErrors }: { fatalErrors: FatalErrorsSetup }): {
    getLoadingCount$: () => Observable<number>;
    addLoadingCountSource: (count$: Observable<number>) => void;
  };
  stop(): void;
}
