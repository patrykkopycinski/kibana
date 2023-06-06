/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

// Connector schema
export const SentinelOneConfigSchema = schema.object({ url: schema.string() });
export const SentinelOneSecretsSchema = schema.object({
  token: schema.string(),
});

// Stories action schema
export const SentinelOneStoriesActionParamsSchema = null;
export const SentinelOneStoryObjectSchema = schema.object({
  id: schema.number(),
  name: schema.string(),
  published: schema.boolean(),
});
export const SentinelOneStoriesActionResponseSchema = schema.object({
  stories: schema.arrayOf(SentinelOneStoryObjectSchema),
  incompleteResponse: schema.boolean(),
});

// Webhooks action schema
export const SentinelOneWebhooksActionParamsSchema = schema.object({ storyId: schema.number() });
export const SentinelOneWebhookObjectSchema = schema.object({
  id: schema.number(),
  name: schema.string(),
  storyId: schema.number(),
  path: schema.string(),
  secret: schema.string(),
});
export const SentinelOneWebhooksActionResponseSchema = schema.object({
  webhooks: schema.arrayOf(SentinelOneWebhookObjectSchema),
  incompleteResponse: schema.boolean(),
});

// Run action schema
export const SentinelOneRunActionParamsSchema = schema.object({
  webhook: schema.maybe(SentinelOneWebhookObjectSchema),
  webhookUrl: schema.maybe(schema.string()),
  body: schema.string(),
});
export const SentinelOneRunActionResponseSchema = schema.object({}, { unknowns: 'ignore' });
