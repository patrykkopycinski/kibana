/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const ftrTimingEnabled: boolean;
export declare const activateTiming: () => void;
export declare class FtrTimingRegistry {
  private readonly entries;
  record(name: string, durationMs: number): void;
  writeToFile(filePath: string): void;
}
export declare const ftrTimingRegistry: FtrTimingRegistry;
/**
 * Wraps every method on `instance` in a timing proxy that records each call's
 * wall-clock duration into `ftrTimingRegistry`. Skips `init` so that
 * `isAsyncInstance` detection continues to work on async providers.
 *
 * Only called when `ftrTimingEnabled` is true.
 */
export declare function createTimingProxy(
  name: string,
  instance: {
    [k: string | symbol]: any;
  }
): typeof instance;
