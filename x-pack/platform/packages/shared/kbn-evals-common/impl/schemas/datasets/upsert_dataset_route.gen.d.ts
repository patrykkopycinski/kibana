/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
export declare const UpsertDatasetExamplePayload: z.ZodObject<
  {
    input: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    output: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    metadata: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
  },
  z.core.$strip
>;
export type UpsertDatasetExamplePayload = z.infer<typeof UpsertDatasetExamplePayload>;
export declare const UpsertEvaluationDatasetRequestBody: z.ZodObject<
  {
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
    examples: z.ZodArray<
      z.ZodObject<
        {
          input: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
          output: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
          metadata: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        },
        z.core.$strip
      >
    >;
    space_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export type UpsertEvaluationDatasetRequestBody = z.infer<typeof UpsertEvaluationDatasetRequestBody>;
export type UpsertEvaluationDatasetRequestBodyInput = z.input<
  typeof UpsertEvaluationDatasetRequestBody
>;
export declare const UpsertEvaluationDatasetResponse: z.ZodObject<
  {
    dataset_id: z.ZodString;
    added: z.ZodNumber;
    removed: z.ZodNumber;
    unchanged: z.ZodNumber;
  },
  z.core.$strip
>;
export type UpsertEvaluationDatasetResponse = z.infer<typeof UpsertEvaluationDatasetResponse>;
