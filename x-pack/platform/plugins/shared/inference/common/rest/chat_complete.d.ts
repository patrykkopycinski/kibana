/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ChatCompleteAPI } from '@kbn/inference-common';
export declare function createChatCompleteRestApi({
  fetch,
  signal,
}: {
  fetch: HttpHandler;
  signal?: AbortSignal;
}): ChatCompleteAPI;
