/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
export declare const rangeValueSchema: z.ZodArray<z.ZodString>;
export declare const rangeSliderControlSchema: z.ZodPreprocess<
  z.ZodDiscriminatedUnion<
    [
      z.ZodObject<
        {
          title: z.ZodOptional<z.ZodString>;
          use_global_filters: z.ZodDefault<z.ZodBoolean>;
          ignore_validations: z.ZodDefault<z.ZodBoolean>;
          values_source: z.ZodLiteral<import('@kbn/controls-constants').ControlValuesSource.ESQL>;
          esql_query: z.ZodString;
          value: z.ZodOptional<z.ZodArray<z.ZodString>>;
          step: z.ZodDefault<z.ZodNumber>;
        },
        z.core.$strip
      >,
      z.ZodObject<
        {
          title: z.ZodOptional<z.ZodString>;
          use_global_filters: z.ZodDefault<z.ZodBoolean>;
          ignore_validations: z.ZodDefault<z.ZodBoolean>;
          values_source: z.ZodDefault<
            z.ZodUnion<
              readonly [z.ZodLiteral<import('@kbn/controls-constants').ControlValuesSource.FIELD>]
            >
          >;
          data_view_id: z.ZodString;
          field_name: z.ZodString;
          value: z.ZodOptional<z.ZodArray<z.ZodString>>;
          step: z.ZodDefault<z.ZodNumber>;
        },
        z.core.$strip
      >
    ],
    'values_source'
  >
>;
