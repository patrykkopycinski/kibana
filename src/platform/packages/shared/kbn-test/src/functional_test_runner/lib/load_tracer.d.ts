/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 *  Trace the path followed as dependencies are loaded and
 *  check for circular dependencies at each step
 *
 *  @param  {Any} ident identity of this load step, === compared
 *                         to identities of previous steps to find circles
 *  @param  {String} description description of this step
 *  @param  {Function} load function that executes this step
 *  @return {Any} the value produced by load()
 */
export declare function loadTracer(
  ident: any,
  description: string,
  load: () => Promise<void> | void
): void | Promise<void>;
