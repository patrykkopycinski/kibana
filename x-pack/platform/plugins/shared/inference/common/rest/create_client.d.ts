/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient, BoundOptions, InferenceClient } from '@kbn/inference-common';
import type { HttpHandler } from '@kbn/core/public';
interface RestOptions {
  fetch: HttpHandler;
  signal?: AbortSignal;
}
interface BoundRestOptions extends RestOptions {
  bindTo: BoundOptions;
}
export declare function createRestClient(options: RestOptions): InferenceClient;
export declare function createRestClient(options: BoundRestOptions): BoundInferenceClient;
export {};
