/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

const elasticsearchOperationSchema = z.object({
  type: z.literal('elasticsearch'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD']).default('GET'),
  path: z.string().min(1),
  body: z.record(z.string(), z.unknown()).optional(),
});

const kibanaOperationSchema = z.object({
  type: z.literal('kibana'),
  method: z.string().default('GET'),
  path: z.string().min(1),
  body: z.unknown().optional(),
  query: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const retryOperationSchema = z.discriminatedUnion('type', [
  elasticsearchOperationSchema,
  kibanaOperationSchema,
]);

export const retryWithBackoffInputSchema = z.object({
  operation: retryOperationSchema,
  max_retries: z.number().int().min(1).max(20).default(3),
  initial_delay_ms: z.number().int().min(0).default(1000),
  backoff_multiplier: z.number().positive().default(2),
});

export const retryWithBackoffOutputSchema = z.object({
  success: z.boolean(),
  attempts: z.number(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const retryWithBackoffStepCommonDefinition: BaseStepDefinition<
  typeof retryWithBackoffInputSchema,
  typeof retryWithBackoffOutputSchema
> = {
  id: 'security.retryWithBackoff',
  label: i18n.translate('xpack.securitySolution.workflows.steps.retryWithBackoff.label', {
    defaultMessage: 'Retry with backoff',
  }),
  description: i18n.translate('xpack.securitySolution.workflows.steps.retryWithBackoff.description', {
    defaultMessage:
      'Execute an Elasticsearch transport request or an internal Kibana HTTP call with exponential backoff on retryable errors.',
  }),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: retryWithBackoffInputSchema,
  outputSchema: retryWithBackoffOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.retryWithBackoff.documentation.details',
      {
        defaultMessage:
          'Retries on HTTP 429 / 503, Elasticsearch equivalents, and network timeouts. Kibana paths are resolved against the workflow kibanaUrl with space prefix and the execution user credentials.',
      }
    ),
    examples: [
      `## Retry an Elasticsearch search
\`\`\`yaml
- name: retry_es
  type: security.retryWithBackoff
  with:
    operation:
      type: elasticsearch
      method: GET
      path: /_cluster/health
    max_retries: 3
    initial_delay_ms: 500
    backoff_multiplier: 2
\`\`\``,
    ],
  },
};
