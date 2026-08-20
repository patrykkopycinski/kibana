/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
export declare const DeleteEvaluationDatasetExampleRequestParams: z.ZodObject<
  {
    datasetId: z.ZodString;
    exampleId: z.ZodString;
  },
  z.core.$strip
>;
export type DeleteEvaluationDatasetExampleRequestParams = z.infer<
  typeof DeleteEvaluationDatasetExampleRequestParams
>;
export type DeleteEvaluationDatasetExampleRequestParamsInput = z.input<
  typeof DeleteEvaluationDatasetExampleRequestParams
>;
export declare const DeleteEvaluationDatasetExampleResponse: z.ZodObject<
  {
    success: z.ZodBoolean;
  },
  z.core.$strip
>;
export type DeleteEvaluationDatasetExampleResponse = z.infer<
  typeof DeleteEvaluationDatasetExampleResponse
>;
