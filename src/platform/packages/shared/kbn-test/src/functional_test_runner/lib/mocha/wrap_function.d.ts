/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 *  Wrap the execution of a function with a series of Hooks
 *
 *  @param  {Function} fn
 *  @param  {Object} [hooks={}]
 *  @property {Function} hooks.before
 *  @property {Function} hooks.after
 *  @return {Any}
 */
export declare function wrapFunction(fn: Function, hooks?: Object): Any;
/**
 *  Wrap the execution of an async function with a series of Hooks
 *
 *  @param  {AsyncFunction} fn
 *  @param  {Object} [hooks={}]
 *  @property {AsyncFunction} hooks.before
 *  @property {AsyncFunction} hooks.handleError
 *  @property {AsyncFunction} hooks.after
 *  @return {Any}
 */
export declare function wrapAsyncFunction(fn: AsyncFunction, hooks?: Object): Any;
