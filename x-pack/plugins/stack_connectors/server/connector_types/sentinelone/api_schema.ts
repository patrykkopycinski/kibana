/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, TypeOf } from '@kbn/config-schema';
import { SentinelOneStoryObjectSchema } from '../../../common/sentinelone/schema';

// SentinelOne response base schema
export const SentinelOneBaseApiResponseSchema = schema.object({}, { unknowns: 'ignore' });

// Stories action schema
export const SentinelOneStoriesApiResponseSchema = SentinelOneBaseApiResponseSchema.extends(
  {
    // stories: schema.arrayOf(SentinelOneStoryObjectSchema.extends({}, { unknowns: 'ignore' })),
  },
  { unknowns: 'ignore' }
);

// Webhooks action schema
export const SentinelOneWebhooksApiResponseSchema = SentinelOneBaseApiResponseSchema.extends(
  {
    agents: schema.arrayOf(
      schema.object(
        {
          id: schema.number(),
          name: schema.string(),
          type: schema.string(),
          story_id: schema.number(),
          options: schema.object(
            {
              path: schema.maybe(schema.string()),
              secret: schema.maybe(schema.string()),
            },
            { unknowns: 'ignore' }
          ),
        },
        { unknowns: 'ignore' }
      )
    ),
  },
  { unknowns: 'ignore' }
);

export const SentinelOneRunApiResponseSchema = schema.object({}, { unknowns: 'ignore' });

export type SentinelOneBaseApiResponse = TypeOf<typeof SentinelOneBaseApiResponseSchema>;
export type SentinelOneStoriesApiResponse = TypeOf<typeof SentinelOneStoriesApiResponseSchema>;
export type SentinelOneWebhooksApiResponse = TypeOf<typeof SentinelOneWebhooksApiResponseSchema>;
export type SentinelOneRunApiResponse = TypeOf<typeof SentinelOneRunApiResponseSchema>;
