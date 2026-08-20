/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 *  Wraps a "runnable" defining function (it(), beforeEach(), etc.)
 *  so that any "runnable" arguments passed to it are wrapped and will
 *  trigger a lifecycle event if they throw an error.
 */
export declare function wrapRunnableArgs(fn: any, lifecycle: any, handler: any, options?: {}): Any;
