/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TypeOf } from '@kbn/config-schema';
import {
  SentinelOneConfigSchema,
  SentinelOneSecretsSchema,
  SentinelOneRunActionParamsSchema,
  SentinelOneRunActionResponseSchema,
  SentinelOneStoriesActionResponseSchema,
  SentinelOneWebhooksActionResponseSchema,
  SentinelOneWebhooksActionParamsSchema,
  SentinelOneWebhookObjectSchema,
  SentinelOneStoryObjectSchema,
} from './schema';

export type SentinelOneConfig = TypeOf<typeof SentinelOneConfigSchema>;
export type SentinelOneSecrets = TypeOf<typeof SentinelOneSecretsSchema>;
export type SentinelOneRunActionParams = TypeOf<typeof SentinelOneRunActionParamsSchema>;
export type SentinelOneRunActionResponse = TypeOf<typeof SentinelOneRunActionResponseSchema>;
export type SentinelOneStoriesActionParams = void;
export type SentinelOneStoryObject = TypeOf<typeof SentinelOneStoryObjectSchema>;
export type SentinelOneStoriesActionResponse = TypeOf<
  typeof SentinelOneStoriesActionResponseSchema
>;
export type SentinelOneWebhooksActionParams = TypeOf<typeof SentinelOneWebhooksActionParamsSchema>;
export type SentinelOneWebhooksActionResponse = TypeOf<
  typeof SentinelOneWebhooksActionResponseSchema
>;
export type SentinelOneWebhookObject = TypeOf<typeof SentinelOneWebhookObjectSchema>;
