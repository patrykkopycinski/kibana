/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
export declare const ListEvaluatorsResponse: z.ZodObject<
  {
    evaluators: z.ZodArray<
      z.ZodObject<
        {
          name: z.ZodString;
          version: z.ZodString;
          kind: z.ZodEnum<{
            code: 'code';
            llm: 'llm';
          }>;
          description: z.ZodString;
          reference_data_schema: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
          evidence_schema: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        },
        z.core.$strip
      >
    >;
  },
  z.core.$strip
>;
export type ListEvaluatorsResponse = z.infer<typeof ListEvaluatorsResponse>;
