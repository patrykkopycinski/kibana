/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
export declare const DeleteEvaluationDatasetRequestQuery: z.ZodObject<
  {
    intent: z.ZodOptional<
      z.ZodEnum<{
        delete: 'delete';
        unshare: 'unshare';
      }>
    >;
  },
  z.core.$strip
>;
export type DeleteEvaluationDatasetRequestQuery = z.infer<
  typeof DeleteEvaluationDatasetRequestQuery
>;
export type DeleteEvaluationDatasetRequestQueryInput = z.input<
  typeof DeleteEvaluationDatasetRequestQuery
>;
export declare const DeleteEvaluationDatasetRequestParams: z.ZodObject<
  {
    datasetId: z.ZodString;
  },
  z.core.$strip
>;
export type DeleteEvaluationDatasetRequestParams = z.infer<
  typeof DeleteEvaluationDatasetRequestParams
>;
export type DeleteEvaluationDatasetRequestParamsInput = z.input<
  typeof DeleteEvaluationDatasetRequestParams
>;
export declare const DeleteEvaluationDatasetResponse: z.ZodObject<
  {
    success: z.ZodBoolean;
    unshared: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strip
>;
export type DeleteEvaluationDatasetResponse = z.infer<typeof DeleteEvaluationDatasetResponse>;
