/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { OperatorFunction } from 'rxjs';
import type { InferenceTaskEvent } from '@kbn/inference-common';
import type { StreamedHttpResponse } from './create_observable_from_http_response';
export declare function httpResponseIntoObservable<
  T extends InferenceTaskEvent = never
>(): OperatorFunction<StreamedHttpResponse, T>;
