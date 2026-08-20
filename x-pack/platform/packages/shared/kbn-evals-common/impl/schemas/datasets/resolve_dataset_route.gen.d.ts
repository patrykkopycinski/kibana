/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
export declare const ResolveEvaluationDatasetRequestQuery: z.ZodObject<
  {
    name: z.ZodString;
  },
  z.core.$strip
>;
export type ResolveEvaluationDatasetRequestQuery = z.infer<
  typeof ResolveEvaluationDatasetRequestQuery
>;
export type ResolveEvaluationDatasetRequestQueryInput = z.input<
  typeof ResolveEvaluationDatasetRequestQuery
>;
export declare const ResolveEvaluationDatasetResponse: z.ZodObject<
  {
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    maturity: z.ZodOptional<
      z.ZodEnum<{
        cleaned: 'cleaned';
        golden: 'golden';
        raw: 'raw';
      }>
    >;
    space_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    examples_count: z.ZodOptional<z.ZodNumber>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
  },
  z.core.$strip
>;
export type ResolveEvaluationDatasetResponse = z.infer<typeof ResolveEvaluationDatasetResponse>;
