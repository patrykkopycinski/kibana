/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

declare const FAIL_TAG: unique symbol;
interface FailError extends Error {
  exitCode: number;
  showHelp: boolean;
  [FAIL_TAG]: true;
}
interface FailErrorOptions {
  exitCode?: number;
  showHelp?: boolean;
}
export declare function createFailError(reason: string, options?: FailErrorOptions): FailError;
export declare function createFlagError(reason: string): FailError;
export declare function isFailError(error: any): error is FailError;
export declare function combineErrors(errors: Array<Error | FailError>): Error;
export {};
