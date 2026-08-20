/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
export declare const DatasetExample: z.ZodObject<
  {
    id: z.ZodString;
    input: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    output: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    metadata: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
  },
  z.core.$strip
>;
export type DatasetExample = z.infer<typeof DatasetExample>;
export declare const GetEvaluationDatasetRequestParams: z.ZodObject<
  {
    datasetId: z.ZodString;
  },
  z.core.$strip
>;
export type GetEvaluationDatasetRequestParams = z.infer<typeof GetEvaluationDatasetRequestParams>;
export type GetEvaluationDatasetRequestParamsInput = z.input<
  typeof GetEvaluationDatasetRequestParams
>;
export declare const GetEvaluationDatasetResponse: z.ZodObject<
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
    examples: z.ZodArray<
      z.ZodObject<
        {
          id: z.ZodString;
          input: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
          output: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
          metadata: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
          created_at: z.ZodString;
          updated_at: z.ZodString;
        },
        z.core.$strip
      >
    >;
    created_at: z.ZodString;
    updated_at: z.ZodString;
  },
  z.core.$strip
>;
export type GetEvaluationDatasetResponse = z.infer<typeof GetEvaluationDatasetResponse>;
