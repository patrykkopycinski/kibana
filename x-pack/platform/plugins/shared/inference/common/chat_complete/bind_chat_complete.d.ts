/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChatCompleteAPI, BoundChatCompleteAPI, BoundOptions } from '@kbn/inference-common';
/**
 * Bind chatComplete to the provided parameters,
 * returning a bound version of the API.
 */
export declare function bindChatComplete(
  chatComplete: ChatCompleteAPI,
  boundParams: BoundOptions
): BoundChatCompleteAPI;
