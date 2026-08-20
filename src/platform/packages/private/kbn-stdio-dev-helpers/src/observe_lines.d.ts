/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Readable } from 'stream';
import type * as Rx from 'rxjs';
/**
 *  Creates an Observable from a Readable Stream that:
 *   - splits data from `readable` into lines
 *   - completes when `readable` emits "end"
 *   - fails if `readable` emits "errors"
 *
 *  @param  {ReadableStream} readable
 *  @return {Rx.Observable}
 */
export declare function observeLines(readable: Readable): Rx.Observable<string>;
