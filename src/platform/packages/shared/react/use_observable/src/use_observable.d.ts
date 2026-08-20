/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface Observable<T> {
  subscribe: (listener: (value: T) => void) => {
    unsubscribe: () => void;
  };
}
export interface ValueObservable<T> extends Observable<T> {
  getValue: () => T;
}
export declare function useObservable<T>(observable$: ValueObservable<T>): T;
export declare function useObservable<T>(observable$: Observable<T>, initialValue: T): T;
export declare function useObservable<T>(observable$: Observable<T>): T | undefined;
